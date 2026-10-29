import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { SEED } from "./session.ts";

/**
 * Support e2e (pas du code de production) : insère en base des invitations et des sessions réelles
 * pour une adresse donnée. OAuth GitHub est inutilisable en CI, donc le test pose le cookie signé.
 */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

async function withClient<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: requiredEnv("DATABASE_URL") });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export interface InvitationOptions {
  email: string;
  role?: string;
  status?: "pending" | "accepted" | "canceled" | "rejected";
  /** Décalage de l'expiration en jours (négatif = déjà expirée). Défaut : +7. */
  expiresInDays?: number;
}

/** Insère une invitation dans l'organisation du seed, envoyée par l'admin du seed. Renvoie son id. */
export async function insertInvitation({
  email,
  role = "dev",
  status = "pending",
  expiresInDays = 7,
}: InvitationOptions): Promise<string> {
  const id = randomUUID();
  await withClient((client) =>
    client.query(
      `INSERT INTO invitations (id, organization_id, email, role, status, expires_at, inviter_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval, $7, now(), now())`,
      [id, SEED.organization, email, role, status, String(expiresInDays), SEED.adminUser],
    ),
  );
  return id;
}

export interface InvitedUser {
  cookie: string;
  userId: string;
  email: string;
}

/** Crée un utilisateur (e-mail choisi) et une vraie session sans organisation active ; membre du seed si demandé. */
export async function createUserSession(
  email: string,
  { memberRole }: { memberRole?: string } = {},
): Promise<InvitedUser> {
  const secret = requiredEnv("BETTER_AUTH_SECRET");
  const token = randomBytes(24).toString("base64url");
  const userId = randomUUID();
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, true, now(), now())`,
      [userId, "Personne Invitée", email],
    );
    if (memberRole) {
      await client.query(
        `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())`,
        [randomUUID(), SEED.organization, userId, memberRole],
      );
    }
    await client.query(
      `INSERT INTO sessions (id, token, user_id, active_organization_id, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, now() + interval '1 hour', now(), now())`,
      [randomUUID(), token, userId],
    );
  });
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return { cookie: encodeURIComponent(`${token}.${signature}`), userId, email };
}

export const uniqueEmail = (prefix: string): string => `${prefix}-${randomUUID()}@example.com`;

export async function readInvitationStatus(id: string): Promise<string | null> {
  return withClient(async (client) => {
    const { rows } = await client.query("SELECT status FROM invitations WHERE id = $1", [id]);
    return rows[0]?.status ?? null;
  });
}

export async function readMembership(
  userId: string,
): Promise<{ role: string; count: number } | null> {
  return withClient(async (client) => {
    const { rows } = await client.query(
      "SELECT role FROM members WHERE user_id = $1 AND organization_id = $2",
      [userId, SEED.organization],
    );
    return rows.length ? { role: rows[0].role, count: rows.length } : null;
  });
}

export async function readActiveOrganization(userId: string): Promise<string | null> {
  return withClient(async (client) => {
    const { rows } = await client.query(
      "SELECT active_organization_id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    return rows[0]?.active_organization_id ?? null;
  });
}
