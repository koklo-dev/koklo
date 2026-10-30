import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Support e2e (pas du code de production) : accès base et sessions Better Auth réelles.
 * OAuth GitHub est inutilisable en CI, donc les tests posent un cookie signé avec BETTER_AUTH_SECRET.
 */

export const SESSION_COOKIE = "better-auth.session_token";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

export async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: requiredEnv("DATABASE_URL") });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function insertUser(
  client: pg.Client,
  { email, name, id = randomUUID() }: { email: string; name: string; id?: string },
): Promise<string> {
  await client.query(
    `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, true, now(), now())`,
    [id, name, email],
  );
  return id;
}

export async function insertMembership(
  client: pg.Client,
  organizationId: string,
  userId: string,
  role: string,
): Promise<void> {
  await client.query(
    `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [randomUUID(), organizationId, userId, role],
  );
}

/** Insère une session (organisation active ou NULL) et renvoie la valeur du cookie `<token>.<hmac base64>` encodée. */
export async function insertSession(
  client: pg.Client,
  userId: string,
  activeOrganizationId: string | null,
): Promise<string> {
  const secret = requiredEnv("BETTER_AUTH_SECRET");
  const token = randomBytes(24).toString("base64url");
  await client.query(
    `INSERT INTO sessions (id, token, user_id, active_organization_id, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now() + interval '1 hour', now(), now())`,
    [randomUUID(), token, userId, activeOrganizationId],
  );
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}
