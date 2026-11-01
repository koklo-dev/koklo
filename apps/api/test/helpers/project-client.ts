import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { Actor } from "./organizations.ts";
import { send } from "./tickets.ts";

/**
 * Client des procédures `projectClient.*` (contrat 0.10.0, HTTP réel). Contrat fixé par
 * .workflow/TK-55/02-decisions-55a.md :
 *  - list   GET    /projects/{projectId}/clients            -> [{ memberId, userId, name, email, createdAt }]
 *  - add    POST   /projects/{projectId}/clients            { memberId } -> l'élément ci-dessus (idempotent)
 *  - remove DELETE /projects/{projectId}/clients/{memberId}               -> { removed: boolean } (idempotent)
 */
export function projectClientApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    list: (projectId: string) => send(app, cookie, "get", `/projects/${projectId}/clients`),
    add: (projectId: string, memberId: string, over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", `/projects/${projectId}/clients`, { projectId, memberId, ...over }),
    remove: (projectId: string, memberId: string) =>
      send(app, cookie, "delete", `/projects/${projectId}/clients/${memberId}`),
  };
}

export interface LinkRow {
  id: string;
  organization_id: string;
  project_id: string;
  user_id: string;
  created_by_user_id: string | null;
}

export function linkRows(database: TestDatabase, projectId: string): Promise<LinkRow[]> {
  return database.query<LinkRow>(
    `SELECT id, organization_id, project_id, user_id, created_by_user_id
       FROM project_client_access WHERE project_id = $1 ORDER BY created_at, id`,
    [projectId],
  );
}

export async function linkCountOfUser(database: TestDatabase, userId: string): Promise<number> {
  const rows = await database.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM project_client_access WHERE user_id = $1",
    [userId],
  );
  return rows[0]?.n ?? 0;
}

export interface AuditRow {
  action: string;
  target_kind: string;
  target_id: string;
  actor_id: string | null;
  ticket_id: string | null;
}

/** Entrées d'audit d'une organisation pour des actions données, de la plus ancienne à la plus récente. */
export function auditOf(
  database: TestDatabase,
  organizationId: string,
  actions: string[],
): Promise<AuditRow[]> {
  return database.query<AuditRow>(
    `SELECT action, target_kind, target_id, actor_id, ticket_id FROM audit_log
      WHERE organization_id = $1 AND action = ANY($2::text[]) ORDER BY occurred_at, id`,
    [organizationId, actions],
  );
}
