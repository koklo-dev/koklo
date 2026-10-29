import { randomUUID } from "node:crypto";
import type { Role } from "@koklo/contract";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import request from "supertest";
import { insertSession, insertUser } from "./session.ts";

/** File d'envoi des invitations (contrat TK-23) ; le worker en possède la création en production. */
export const SEND_INVITATION_QUEUE = "send-invitation";

export const ROLES = ["owner", "admin", "dev", "designer", "client", "business"] as const;

export interface Actor {
  userId: string;
  memberId: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  /** Cookie de session réel dont l'organisation active est `organizationId`. */
  cookie: string;
}

export async function insertOrganization(database: TestDatabase, slug: string): Promise<string> {
  const id = randomUUID();
  await database.query(
    "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $2, now(), now())",
    [id, slug],
  );
  return id;
}

/** Utilisateur membre de `organizationId` avec `role` (table members) et sa session active. */
export async function insertActor(
  database: TestDatabase,
  organizationId: string,
  role: Role,
  label: string = role,
): Promise<Actor> {
  const userId = randomUUID();
  const memberId = randomUUID();
  const email = `${label}-${userId.slice(0, 8)}@example.test`;
  await insertUser(database, userId, email);
  await database.query("UPDATE users SET name = $2 WHERE id = $1", [userId, `Nom ${label}`]);
  await database.query(
    `INSERT INTO members (id, organization_id, user_id, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [memberId, organizationId, userId, role],
  );
  const cookie = await insertSession(database, { userId, activeOrganizationId: organizationId });
  return { userId, memberId, email, name: `Nom ${label}`, role, organizationId, cookie };
}

/** Session valide d'un utilisateur sans organisation active. */
export async function insertSessionWithoutOrganization(database: TestDatabase) {
  const userId = randomUUID();
  await insertUser(database, userId, `solo-${userId.slice(0, 8)}@example.test`);
  return { userId, cookie: await insertSession(database, { userId }) };
}

export function tokenOfCookie(cookie: string): string {
  const value = decodeURIComponent(cookie.split("=")[1] ?? "");
  return value.split(".")[0] ?? "";
}

export async function roleInDatabase(database: TestDatabase, memberId: string) {
  const rows = await database.query<{ role: string }>("SELECT role FROM members WHERE id = $1", [
    memberId,
  ]);
  return rows[0]?.role;
}

export async function count(
  database: TestDatabase,
  table: string,
  where = "true",
  params: unknown[] = [],
) {
  const rows = await database.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`,
    params,
  );
  return rows[0]?.n ?? 0;
}

/** Producteur pg-boss de test : crée le schéma et la file que le worker créerait. */
export async function startQueueBoss(database: TestDatabase): Promise<PgBoss> {
  const boss = new PgBoss(database.url);
  await boss.start();
  await boss.createQueue(SEND_INVITATION_QUEUE);
  return boss;
}

export type Method = "get" | "post" | "patch";

export function call(
  app: INestApplication,
  cookie: string | undefined,
  method: Method,
  path: string,
  body?: Record<string, unknown>,
) {
  const req = request(app.getHttpServer())[method](path);
  if (cookie) {
    req.set("Cookie", cookie);
  }
  return body === undefined ? req : req.send(body);
}
