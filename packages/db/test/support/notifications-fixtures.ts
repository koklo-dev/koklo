import { randomUUID } from "node:crypto";
import type { TestDatabase } from "../../src/testing/test-database.ts";
import { insertUser } from "./oauth-fixtures.ts";
import { insertScope, type Scope } from "./ticket-fixtures.ts";

/** Table ajoutée par TK-51d (notifications in-app, sans charge utile libre). */
export const NOTIFICATION_TABLES = ["notifications"] as const;
export const NOTIFICATION_MODELS = ["Notification"] as const;

/** TK-58a : suivi de l'envoi d'e-mail (colonnes ajoutées par la migration additive suivante). */
export const NOTIFICATION_EMAIL_STATE_SUFFIX = "_notification_email_state";
export const NOTIFICATION_EMAIL_STATES = ["pending", "sent", "skipped", "failed"] as const;

export const NOTIFICATION_SUFFIX = "_notifications";
export const NOTIFICATION_MIGRATION = "20261101120000_notifications";

/** Listes fermées imposées par CHECK (décision D7 : du texte contraint, pas d'enum natif). */
export const NOTIFICATION_TYPES = [
  "suggestion.created",
  "suggestion.decided",
  "review.submitted",
  "baseline.proposed",
  "baseline.validated",
  "baseline.tagged",
  "ticket.blocked",
] as const;
export const NOTIFICATION_SUBJECT_KINDS = ["suggestion", "review", "baseline", "ticket"] as const;

/** Colonnes exactes (`udt_name/is_nullable`) : aucune JSON, aucun texte libre long. */
export const NOTIFICATION_COLUMNS = {
  created_at: "timestamptz/NO",
  dedupe_key: "text/NO",
  email_state: "text/NO",
  emailed_at: "timestamptz/YES",
  id: "uuid/NO",
  organization_id: "uuid/NO",
  project_id: "uuid/YES",
  read_at: "timestamptz/YES",
  recipient_user_id: "uuid/NO",
  subject_kind: "text/NO",
  subject_ref: "text/NO",
  type: "text/NO",
  updated_at: "timestamptz/NO",
} as const;

/** Une organisation, un projet et un destinataire membre de l'organisation. */
export interface NotificationScope extends Scope {
  userId: string;
}

export async function insertMember(
  db: Pick<TestDatabase, "query">,
  organizationId: string,
  userId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
     VALUES ($1, $2, $3, 'member', now(), now())`,
    [randomUUID(), organizationId, userId],
  );
}

export async function notificationScope(
  db: TestDatabase,
  label: string,
): Promise<NotificationScope> {
  const scope = await insertScope(db, label);
  const userId = await insertUser(db, label);
  await insertMember(db, scope.organizationId, userId);
  return { ...scope, userId };
}

/** Un second destinataire membre de la même organisation. */
export async function secondRecipient(
  db: TestDatabase,
  scope: NotificationScope,
  label = "second",
): Promise<string> {
  const userId = await insertUser(db, label);
  await insertMember(db, scope.organizationId, userId);
  return userId;
}

export interface NotificationOverrides {
  id?: string;
  organizationId?: string;
  recipientUserId?: string;
  projectId?: string | null;
  type?: string;
  subjectKind?: string;
  subjectRef?: string;
  dedupeKey?: string;
  readAt?: string | null;
}

const pick = <T>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);

/** Insère une notification non lue valide ; chaque colonne est fournie explicitement. */
export async function insertNotification(
  db: Pick<TestDatabase, "query">,
  scope: NotificationScope,
  o: NotificationOverrides = {},
): Promise<string> {
  const id = o.id ?? randomUUID();
  await db.query(
    `INSERT INTO notifications (id, organization_id, recipient_user_id, project_id, type,
       subject_kind, subject_ref, dedupe_key, read_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
    [
      id,
      o.organizationId ?? scope.organizationId,
      o.recipientUserId ?? scope.userId,
      pick(o.projectId, scope.projectId),
      o.type ?? "suggestion.created",
      o.subjectKind ?? "suggestion",
      o.subjectRef ?? "SG-1",
      o.dedupeKey ?? `suggestion.created:${id}`,
      pick(o.readAt, null),
    ],
  );
  return id;
}
