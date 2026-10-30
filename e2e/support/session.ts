import { randomUUID } from "node:crypto";
import { insertSession, insertUser, SESSION_COOKIE, withClient } from "./db.ts";

export { SESSION_COOKIE };

/** Identifiants du seed (packages/db/src/seed.ts, SEED_IDS) : le test lit la base seedée, il ne la crée pas. */
export const SEED = {
  organization: "01900000-0000-7000-8000-000000000001",
  adminUser: "01900000-0000-7000-8000-000000000002",
  projectName: "Projet de démo",
} as const;

/** Vraie session Better Auth de l'admin du seed, avec l'organisation active. */
export function createAdminSessionCookie(): Promise<string> {
  return withClient((client) => insertSession(client, SEED.adminUser, SEED.organization));
}

/** Nouvel utilisateur sans appartenance et session **sans organisation active** (premier login, lacune G1 de TK-24). */
export function createSessionCookieWithoutOrganization(): Promise<string> {
  return withClient(async (client) => {
    const userId = randomUUID();
    await insertUser(client, {
      id: userId,
      name: "Nouvelle Utilisatrice",
      email: `nouvelle-${userId}@example.com`,
    });
    return insertSession(client, userId, null);
  });
}
