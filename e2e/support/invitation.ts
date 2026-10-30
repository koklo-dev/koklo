import { randomUUID } from "node:crypto";
import { insertMembership, insertSession, insertUser, withClient } from "./db.ts";
import { SEED } from "./session.ts";

/** Support e2e (pas du code de production) : invitations et sessions réelles pour une adresse donnée. */

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
  return withClient(async (client) => {
    const userId = await insertUser(client, { email, name: "Personne Invitée" });
    if (memberRole) await insertMembership(client, SEED.organization, userId, memberRole);
    const cookie = await insertSession(client, userId, null);
    return { cookie, userId, email };
  });
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
