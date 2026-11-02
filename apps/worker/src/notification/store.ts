import type { PrismaClient } from "@koklo/db";
import type { EmailState, NotificationSubjectKind, NotificationType } from "./types.ts";

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

/** SQUELETTE (TK-58b, étape rouge) : requêtes SQL brutes par le client brut (balayage inter-organisations). */
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
    _options: SweepOptions,
    _handler: (ids: readonly string[]) => Promise<T>,
  ): Promise<T> {
    void this.raw;
    throw new Error("not implemented");
  }

  /** Relit la ligne et le destinataire ; classe `ready|skipped|settled|gone` et pose `skipped` si besoin. */
  async claimForSend(_id: string): Promise<ClaimResult> {
    throw new Error("not implemented");
  }

  /** `pending -> sent` (+ `emailed_at`) ; `false` si la ligne n'était plus `pending`. */
  async markSent(_id: string, _at: Date): Promise<boolean> {
    throw new Error("not implemented");
  }

  async markSkipped(_id: string): Promise<boolean> {
    throw new Error("not implemented");
  }

  async markFailed(_id: string): Promise<boolean> {
    throw new Error("not implemented");
  }
}
