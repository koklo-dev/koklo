import type { PrismaClient } from "@koklo/db";
import {
  EMAILED_TYPES,
  type EmailState,
  type NotificationSubjectKind,
  type NotificationType,
} from "./types.ts";

/** Notification prête à être rendue, avec les faits du destinataire relus à l'envoi. */
export interface NotificationEmailContext {
  readonly id: string;
  readonly type: NotificationType;
  readonly subjectKind: NotificationSubjectKind;
  readonly subjectRef: string;
  readonly projectId: string | null;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly recipientEmail: string;
  readonly recipientEmailVerified: boolean;
  readonly readAt: Date | null;
  readonly emailState: EmailState;
  readonly createdAt: Date;
}

export type SkipReason = "already-read" | "unverified-recipient" | "type-not-emailed";

export type ClaimResult =
  | { readonly kind: "ready"; readonly context: NotificationEmailContext }
  | { readonly kind: "skipped"; readonly reason: SkipReason }
  | { readonly kind: "settled" } // déjà sent|skipped|failed : rien à faire
  | { readonly kind: "gone" }; // ligne effacée (membre retiré, purge) : rien à faire

export interface SweepOptions {
  readonly now: Date;
  readonly limit: number;
  readonly windowHours: number;
}

/** Durée maximale d'un lot sous verrou (le gestionnaire enfile les envois, il n'appelle pas le fournisseur). */
const BATCH_TIMEOUT_MS = 60_000;

interface ContextRow {
  id: string;
  type: NotificationType;
  subject_kind: NotificationSubjectKind;
  subject_ref: string;
  project_id: string | null;
  organization_id: string;
  organization_name: string;
  recipient_email: string;
  recipient_email_verified: boolean;
  read_at: Date | null;
  email_state: EmailState;
  created_at: Date;
}

function toContext(row: ContextRow): NotificationEmailContext {
  return {
    id: row.id,
    type: row.type,
    subjectKind: row.subject_kind,
    subjectRef: row.subject_ref,
    projectId: row.project_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    recipientEmail: row.recipient_email,
    recipientEmailVerified: row.recipient_email_verified,
    readAt: row.read_at,
    emailState: row.email_state,
    createdAt: row.created_at,
  };
}

function skipReason(context: NotificationEmailContext): SkipReason | undefined {
  if (!EMAILED_TYPES.includes(context.type)) {
    return "type-not-emailed";
  }
  if (context.readAt !== null) {
    return "already-read";
  }
  return context.recipientEmailVerified ? undefined : "unverified-recipient";
}

/** Requêtes SQL brutes par le client brut (balayage inter-organisations, sans isolation de tenant). */
export class NotificationEmailStore {
  private readonly raw: PrismaClient;
  constructor(raw: PrismaClient) {
    this.raw = raw;
  }

  /**
   * Verrouille (`FOR UPDATE SKIP LOCKED`) au plus `limit` lignes `pending` créées dans la fenêtre, de
   * la plus ancienne à la plus récente, et appelle `handler` avec leurs identifiants TANT QUE les
   * verrous sont tenus (transaction). Deux appels concurrents reçoivent des lots disjoints.
   */
  async withPendingBatch<T>(
    options: SweepOptions,
    handler: (ids: readonly string[]) => Promise<T>,
  ): Promise<T> {
    return this.raw.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM notifications
          WHERE email_state = 'pending'
            AND created_at > ${options.now}::timestamptz - make_interval(hours => ${options.windowHours}::int)
          ORDER BY created_at, id
          LIMIT ${options.limit}
          FOR UPDATE SKIP LOCKED`;
        return handler(rows.map((row) => row.id));
      },
      { timeout: BATCH_TIMEOUT_MS, maxWait: 10_000 },
    );
  }

  /** Relit la ligne et le destinataire ; classe `ready|skipped|settled|gone` et pose `skipped` si besoin. */
  async claimForSend(id: string): Promise<ClaimResult> {
    return this.raw.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<ContextRow[]>`
        SELECT n.id, n.type, n.subject_kind, n.subject_ref, n.project_id, n.organization_id,
               o.name AS organization_name, u.email AS recipient_email,
               u.email_verified AS recipient_email_verified, n.read_at, n.email_state, n.created_at
        FROM notifications n
        JOIN users u ON u.id = n.recipient_user_id
        JOIN organizations o ON o.id = n.organization_id
        WHERE n.id = ${id}::uuid
        FOR UPDATE OF n`;
      if (!row) {
        return { kind: "gone" };
      }
      if (row.email_state !== "pending") {
        return { kind: "settled" };
      }
      const context = toContext(row);
      const reason = skipReason(context);
      if (reason === undefined) {
        return { kind: "ready", context };
      }
      await tx.$executeRaw`
        UPDATE notifications SET email_state = 'skipped', updated_at = now() WHERE id = ${id}::uuid`;
      return { kind: "skipped", reason };
    });
  }

  /** `pending -> sent` (+ `emailed_at`) ; `false` si la ligne n'était plus `pending`. */
  async markSent(id: string, at: Date): Promise<boolean> {
    const count = await this.raw.$executeRaw`
      UPDATE notifications SET email_state = 'sent', emailed_at = ${at}::timestamptz, updated_at = now()
      WHERE id = ${id}::uuid AND email_state = 'pending'`;
    return count > 0;
  }

  async markSkipped(id: string): Promise<boolean> {
    return this.markWithoutDate(id, "skipped");
  }

  async markFailed(id: string): Promise<boolean> {
    return this.markWithoutDate(id, "failed");
  }

  private async markWithoutDate(id: string, state: "skipped" | "failed"): Promise<boolean> {
    const count = await this.raw.$executeRaw`
      UPDATE notifications SET email_state = ${state}, updated_at = now()
      WHERE id = ${id}::uuid AND email_state = 'pending'`;
    return count > 0;
  }
}
