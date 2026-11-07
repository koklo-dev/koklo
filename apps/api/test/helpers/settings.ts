import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { TEST_AUTH_URL } from "./app.ts";
import type { Actor } from "./organizations.ts";
import { insertSession, insertUser } from "./session.ts";
import { auditRows, send } from "./tickets.ts";

/** Client HTTP des routes de réglages (contrat 2.2.0, TK-97). */
export function settingsApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  return {
    orgGet: () => send(app, cookie, "get", "/organization"),
    orgUpdate: (body: Record<string, unknown>) => send(app, cookie, "patch", "/organization", body),
    invite: (body: Record<string, unknown>) => send(app, cookie, "post", "/invitations", body),
    invitations: () => send(app, cookie, "get", "/invitations"),
    resend: (id: string) => send(app, cookie, "post", `/invitations/${id}/resend`, {}),
    revoke: (id: string) => send(app, cookie, "delete", `/invitations/${id}`),
    page: (query = "page=1&size=25") => send(app, cookie, "get", `/members/page?${query}`),
    updateRole: (memberId: string, role: string) =>
      send(app, cookie, "patch", `/members/${memberId}`, { role }),
    remove: (memberId: string) => send(app, cookie, "delete", `/members/${memberId}`),
    me: () => send(app, cookie, "get", "/me"),
    meUpdate: (body: Record<string, unknown>) => send(app, cookie, "patch", "/me", body),
    notifications: () => send(app, cookie, "get", "/me/notifications"),
    setNotification: (key: string, enabled: unknown) =>
      send(app, cookie, "put", `/me/notifications/${key}`, { enabled }),
  };
}

/**
 * Accepte une invitation comme le ferait le lien reçu : un compte vérifié portant l'e-mail invité,
 * session sans organisation active, route d'acceptation de Better Auth (le hook TK-97 y crée les liens).
 */
export async function acceptInvitation(
  app: INestApplication,
  database: TestDatabase,
  invitation: { id: string; email: string },
) {
  const userId = randomUUID();
  await insertUser(database, userId, invitation.email);
  const cookie = await insertSession(database, { userId });
  const response = await send(app, cookie, "post", "/api/auth/organization/accept-invitation", {
    invitationId: invitation.id,
  }).set("Origin", TEST_AUTH_URL);
  return { userId, cookie, response };
}

/** Cookie de la session du compte invité, activée sur l'organisation après l'acceptation. */
export async function activeSessionOf(
  database: TestDatabase,
  userId: string,
  organizationId: string,
) {
  return insertSession(database, { userId, activeOrganizationId: organizationId });
}

export const auditActions = async (database: TestDatabase, organizationId: string) =>
  (await auditRows(database, organizationId)).map((row) => row.action);

export async function invitationRow(database: TestDatabase, id: string) {
  const [row] = await database.query<{ status: string; organization_id: string }>(
    "SELECT status, organization_id FROM invitations WHERE id = $1",
    [id],
  );
  return row;
}

export async function invitationProjectIds(database: TestDatabase, invitationId: string) {
  const rows = await database.query<{ project_id: string }>(
    "SELECT project_id FROM invitation_projects WHERE invitation_id = $1 ORDER BY project_id",
    [invitationId],
  );
  return rows.map((row) => row.project_id);
}
