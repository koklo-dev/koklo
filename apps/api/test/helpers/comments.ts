import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { send } from "./tickets.ts";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Client des procédures comment.* et audit.list du contrat 0.4.0 (HTTP réel). */
export function commentsFor(app: INestApplication, actor: { cookie: string } | undefined) {
  const cookie = actor?.cookie;
  return {
    create: (targetId: string, body = "Un commentaire", over: Record<string, unknown> = {}) =>
      send(app, cookie, "post", "/comments", { targetKind: "ticket", targetId, body, ...over }),
    list: (targetId: string, query = "", targetKind = "ticket") =>
      send(
        app,
        cookie,
        "get",
        `/comments?targetKind=${targetKind}&targetId=${targetId}${query ? `&${query}` : ""}`,
      ),
    remove: (id: string) => send(app, cookie, "delete", `/comments/${id}`),
    listAudit: (query = "") => send(app, cookie, "get", `/audit${query ? `?${query}` : ""}`),
  };
}

export interface CommentRow {
  id: string;
  target_kind: string;
  target_id: string;
  author_kind: string;
  author_id: string | null;
  body: string;
  deleted_at: Date | null;
  created_at: Date;
}

export function commentRows(
  database: TestDatabase,
  organizationId: string,
  targetId?: string,
): Promise<CommentRow[]> {
  return database.query<CommentRow>(
    `SELECT id, target_kind, target_id, author_kind, author_id, body, deleted_at, created_at
       FROM ticket_comments
      WHERE organization_id = $1 AND ($2::uuid IS NULL OR target_id = $2::uuid)
      ORDER BY created_at, id`,
    [organizationId, targetId ?? null],
  );
}

/** Commentaire inséré par la fixture (ligne « système » : author_id NULL, ou dates contrôlées). */
export async function insertCommentRow(
  database: TestDatabase,
  organizationId: string,
  ticketId: string,
  over: {
    authorKind?: string;
    authorId?: string | null;
    body?: string;
    createdAt?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const createdAt = over.createdAt ?? "2026-01-01T00:00:00.000Z";
  await database.query(
    `INSERT INTO ticket_comments (id, organization_id, target_kind, target_id, author_kind, author_id, body, created_at, updated_at)
     VALUES ($1, $2, 'ticket', $3, $4, $5, $6, $7, $7)`,
    [
      id,
      organizationId,
      ticketId,
      over.authorKind ?? "system",
      over.authorId === undefined ? null : over.authorId,
      over.body ?? "Verdict de l'agent",
      createdAt,
    ],
  );
  return id;
}

export interface AuditRowFull {
  id: string;
  action: string;
  target_kind: string;
  target_id: string;
  ticket_id: string | null;
  actor_kind: string;
  actor_id: string | null;
  occurred_at: Date;
}

export function auditRowsFull(
  database: TestDatabase,
  organizationId: string,
): Promise<AuditRowFull[]> {
  return database.query<AuditRowFull>(
    `SELECT id, action, target_kind, target_id, ticket_id, actor_kind, actor_id, occurred_at
       FROM audit_log WHERE organization_id = $1 ORDER BY occurred_at, id`,
    [organizationId],
  );
}

/** Entrée de journal insérée par la fixture (acteurs agent/runner, horodatage contrôlé). */
export async function insertAuditRow(
  database: TestDatabase,
  organizationId: string,
  over: {
    actorKind?: string;
    actorId?: string | null;
    tokenId?: string | null;
    action?: string;
    ticketId?: string | null;
    occurredAt: string;
    id?: string;
  },
): Promise<string> {
  const id = over.id ?? randomUUID();
  await database.query(
    `INSERT INTO audit_log (id, organization_id, actor_kind, actor_id, token_id, action, target_kind, target_id, ticket_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'ticket', $7, $8, $9)`,
    [
      id,
      organizationId,
      over.actorKind ?? "human",
      over.actorId ?? null,
      over.tokenId ?? null,
      over.action ?? "ticket.update",
      over.ticketId ?? randomUUID(),
      over.ticketId ?? null,
      over.occurredAt,
    ],
  );
  return id;
}
