import { createHmac, randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import { TEST_AUTH_SECRET } from "./app.ts";

export const SESSION_COOKIE = "better-auth.session_token";

/** Cookie signé tel que Better Auth l'émet : `<token>.<HMAC-SHA256 base64>`, encodé URL. */
export function signedSessionCookie(token: string, secret = TEST_AUTH_SECRET): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${SESSION_COOKIE}=${encodeURIComponent(`${token}.${signature}`)}`;
}

export interface SessionRow {
  userId: string;
  activeOrganizationId?: string | null;
  expiresAt?: Date;
}

/** Insère une session directement en base (mêmes tables que l'adaptateur) et renvoie son cookie. */
export async function insertSession(database: TestDatabase, row: SessionRow): Promise<string> {
  const token = randomUUID().replaceAll("-", "");
  await database.query(
    `INSERT INTO sessions (id, expires_at, token, user_id, active_organization_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())`,
    [
      randomUUID(),
      // ISO UTC : les colonnes sont des TIMESTAMP sans fuseau lus en UTC par Prisma ; un objet Date
      // serait sérialisé par pg en heure locale (décalage selon le fuseau de la machine).
      (row.expiresAt ?? new Date(Date.now() + 3_600_000)).toISOString(),
      token,
      row.userId,
      row.activeOrganizationId ?? null,
    ],
  );
  return signedSessionCookie(token);
}

export async function insertUser(database: TestDatabase, id: string, email: string) {
  await database.query(
    `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $2, true, now(), now())`,
    [id, email],
  );
}

export async function insertMember(database: TestDatabase, organizationId: string, userId: string) {
  await database.query(
    `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
     VALUES ($1, $2, $3, 'member', now(), now())`,
    [randomUUID(), organizationId, userId],
  );
}
