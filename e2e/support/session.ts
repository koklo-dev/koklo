import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

/** Identifiants du seed (packages/db/src/seed.ts, SEED_IDS) : le test lit la base seedée, il ne la crée pas. */
export const SEED = {
  organization: "01900000-0000-7000-8000-000000000001",
  adminUser: "01900000-0000-7000-8000-000000000002",
  projectName: "Projet de démo",
} as const;

export const SESSION_COOKIE = "better-auth.session_token";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

/**
 * Crée une vraie session Better Auth pour l'admin du seed (ligne `sessions` portant l'organisation
 * active) et renvoie la valeur du cookie signé avec BETTER_AUTH_SECRET (`<token>.<hmac base64>`).
 */
export async function createAdminSessionCookie(): Promise<string> {
  const secret = requiredEnv("BETTER_AUTH_SECRET");
  const token = randomBytes(24).toString("base64url");
  const client = new pg.Client({ connectionString: requiredEnv("DATABASE_URL") });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO sessions (id, token, user_id, active_organization_id, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now() + interval '1 hour', now(), now())`,
      [randomUUID(), token, SEED.adminUser, SEED.organization],
    );
  } finally {
    await client.end();
  }
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}
