import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { auditRowsFull, commentsFor, insertAuditRow } from "./helpers/comments.ts";
import { createAppWithClock, ManualClock } from "./helpers/leases.ts";
import { apiFor, createWorld, seedTicket } from "./helpers/tickets.ts";

/** TK-32 : audit.list (CDC §15) : owner et admin seulement, plus récent d'abord, filtres ET, curseur. */
let database: TestDatabase;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createAppWithClock(database.url, new ManualClock());
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const ids = (response: { body: { items: { id: string }[] } }) =>
  response.body.items.map((item) => item.id);

describe("audit.list : rôles", () => {
  it.each(["owner", "admin"] as const)("%s lit le journal", async (role) => {
    const world = await createWorld(database);
    const response = await commentsFor(app, world.actors[role]).listAudit();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it.each(["dev", "designer", "client", "business"] as const)(
    "%s reçoit FORBIDDEN (403) et ne lit rien",
    async (role) => {
      const world = await createWorld(database);
      await insertAuditRow(database, world.organizationId, {
        occurredAt: "2026-02-01T00:00:00.000Z",
      });
      const response = await commentsFor(app, world.actors[role]).listAudit();
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
      expect(response.body.items).toBeUndefined();
    },
  );

  it("sans session : 401 UNAUTHORIZED", async () => {
    expect((await commentsFor(app, undefined).listAudit()).status).toBe(401);
  });
});

describe("audit.list : tri, sortie, lecture sans effet", () => {
  it("du plus récent au plus ancien, à horodatage égal par id décroissant", async () => {
    const world = await createWorld(database);
    const same = "2026-02-02T10:00:00.000Z";
    const created = [
      await insertAuditRow(database, world.organizationId, {
        occurredAt: "2026-02-02T09:00:00.000Z",
      }),
      await insertAuditRow(database, world.organizationId, { occurredAt: same }),
      await insertAuditRow(database, world.organizationId, { occurredAt: same }),
      await insertAuditRow(database, world.organizationId, {
        occurredAt: "2026-02-02T11:00:00.000Z",
      }),
    ];
    const all = await auditRowsFull(database, world.organizationId);
    const expected = [...all]
      .sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime() || (a.id < b.id ? 1 : -1))
      .map((r) => r.id);

    const response = await commentsFor(app, world.actors.owner).listAudit();

    expect(ids(response)).toEqual(expected);
    expect(ids(response)[0]).toBe(created[3]);
  });
});

describe("audit.list : sortie", () => {
  it("champs conformes à auditEntrySchema : NULL omis, ticketKey résolu même pour un ticket supprimé", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await apiFor(app, world.actors.dev).deleteTicket(ticket.key);
    await insertAuditRow(database, world.organizationId, {
      actorKind: "agent",
      actorId: "agent-1",
      tokenId: "tok-9",
      action: "ticket.update",
      ticketId: ticket.id,
      occurredAt: "2026-02-03T00:00:00.000Z",
    });
    const bare = await insertAuditRow(database, world.organizationId, {
      actorKind: "system",
      action: "sprint.close",
      occurredAt: "2026-02-04T00:00:00.000Z",
    });

    const response = await commentsFor(app, world.actors.admin).listAudit("limit=100");

    const withToken = response.body.items.find((e: { tokenId?: string }) => e.tokenId === "tok-9");
    expect(withToken).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      actorKind: "agent",
      actorId: "agent-1",
      tokenId: "tok-9",
      action: "ticket.update",
      targetKind: "ticket",
      targetId: ticket.id,
      ticketKey: ticket.key,
      occurredAt: "2026-02-03T00:00:00.000Z",
    });
    const noNulls = response.body.items.find((e: { id: string }) => e.id === bare);
    expect(Object.keys(noNulls).sort()).toEqual([
      "action",
      "actorKind",
      "id",
      "occurredAt",
      "targetId",
      "targetKind",
    ]);
  });
});

describe("audit.list : confidentialité", () => {
  it("n'expose jamais le corps d'un commentaire et ne lit rien dans la base", async () => {
    const world = await createWorld(database);
    const ticket = await seedTicket(app, world.actors.dev);
    await commentsFor(app, world.actors.dev).create(ticket.id, "SECRET-DU-COMMENTAIRE");
    const before = await auditRowsFull(database, world.organizationId);

    const response = await commentsFor(app, world.actors.owner).listAudit("limit=100");

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("SECRET-DU-COMMENTAIRE");
    expect(await auditRowsFull(database, world.organizationId)).toHaveLength(before.length);
  });
});

async function fixture() {
  const world = await createWorld(database);
  const a = await seedTicket(app, world.actors.dev);
  const b = await seedTicket(app, world.actors.dev);
  const row = (over: Parameters<typeof insertAuditRow>[2]) =>
    insertAuditRow(database, world.organizationId, over);
  const e1 = await row({
    actorKind: "human",
    action: "x.alpha",
    ticketId: a.id,
    occurredAt: "2026-03-01T00:00:00.000Z",
  });
  const e2 = await row({
    actorKind: "agent",
    action: "x.alpha",
    ticketId: b.id,
    occurredAt: "2026-03-02T00:00:00.000Z",
  });
  const e3 = await row({
    actorKind: "runner",
    action: "x.beta",
    ticketId: a.id,
    occurredAt: "2026-03-03T00:00:00.000Z",
  });
  const e4 = await row({
    actorKind: "agent",
    action: "x.beta",
    occurredAt: "2026-03-04T00:00:00.000Z",
  });
  const owner = commentsFor(app, world.actors.owner);
  const filtered = async (query: string) =>
    (await owner.listAudit(`${query}&limit=100`)).body.items
      .map((e: { id: string }) => e.id)
      .filter((id: string) => [e1, e2, e3, e4].includes(id));
  return { a, b, e1, e2, e3, e4, owner, filtered };
}

describe("audit.list : filtres combinés en ET", () => {
  it("ticketKey", async () => {
    const f = await fixture();
    expect(await f.filtered(`ticketKey=${f.a.key}`)).toEqual([f.e3, f.e1]);
  });

  it("actorKind", async () => {
    const f = await fixture();
    expect(await f.filtered("actorKind=agent")).toEqual([f.e4, f.e2]);
  });

  it("action (égalité exacte)", async () => {
    const f = await fixture();
    expect(await f.filtered("action=x.beta")).toEqual([f.e4, f.e3]);
    expect(await f.filtered("action=x.")).toEqual([]);
  });

  it("from inclus, to exclu", async () => {
    const f = await fixture();
    expect(await f.filtered("from=2026-03-02T00:00:00.000Z")).toEqual([f.e4, f.e3, f.e2]);
    expect(await f.filtered("to=2026-03-03T00:00:00.000Z")).toEqual([f.e2, f.e1]);
    expect(await f.filtered("from=2026-03-02T00:00:00.000Z&to=2026-03-04T00:00:00.000Z")).toEqual([
      f.e3,
      f.e2,
    ]);
  });

  it("from >= to : page vide", async () => {
    const f = await fixture();
    const response = await f.owner.listAudit(
      "from=2026-03-04T00:00:00.000Z&to=2026-03-02T00:00:00.000Z",
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it("filtres combinés", async () => {
    const f = await fixture();
    expect(await f.filtered(`ticketKey=${f.a.key}&actorKind=runner&action=x.beta`)).toEqual([f.e3]);
    expect(await f.filtered(`ticketKey=${f.b.key}&actorKind=runner`)).toEqual([]);
  });

  it("ticketKey inconnu : page vide, pas d'erreur", async () => {
    const f = await fixture();
    const response = await f.owner.listAudit("ticketKey=TK-9999");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [], nextCursor: null });
  });
});

describe("audit.list : pagination et isolation", () => {
  it("défaut 50, maximum 100, hors bornes rejeté, curseur invalide VALIDATION", async () => {
    const world = await createWorld(database);
    for (let i = 0; i < 120; i++) {
      await insertAuditRow(database, world.organizationId, {
        occurredAt: new Date(Date.UTC(2026, 5, 1, 0, 0, Math.floor(i / 3))).toISOString(),
      });
    }
    const owner = commentsFor(app, world.actors.owner);

    const byDefault = await owner.listAudit();
    expect(byDefault.body.items).toHaveLength(50);
    expect(byDefault.body.nextCursor).not.toBeNull();
    expect((await owner.listAudit("limit=100")).body.items).toHaveLength(100);
    expect([400, 422]).toContain((await owner.listAudit("limit=101")).status);
    expect([400, 422]).toContain((await owner.listAudit("limit=0")).status);
    const bad = await owner.listAudit("cursor=%21%21nope");
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("VALIDATION");
    expect(bad.body.data.field).toBe("cursor");
  });
});

describe("audit.list : pagination (suite 2)", () => {
  it("parcours complet sans doublon ni trou malgré les horodatages identiques", async () => {
    const world = await createWorld(database);
    for (let i = 0; i < 37; i++) {
      await insertAuditRow(database, world.organizationId, {
        occurredAt: new Date(Date.UTC(2026, 6, 1, 0, 0, Math.floor(i / 5))).toISOString(),
      });
    }
    const all = await auditRowsFull(database, world.organizationId);
    const expected = [...all]
      .sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime() || (a.id < b.id ? 1 : -1))
      .map((r) => r.id);
    const owner = commentsFor(app, world.actors.owner);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const page = await owner.listAudit(
        `limit=8${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      expect(page.status).toBe(200);
      seen.push(...ids(page));
      cursor = page.body.nextCursor;
      if (cursor === null) {
        break;
      }
    }
    expect(seen).toEqual(expected);
  });

  it("le journal d'une organisation est invisible d'une autre", async () => {
    const one = await createWorld(database);
    const two = await createWorld(database);
    const secret = await insertAuditRow(database, one.organizationId, {
      action: "secret.action",
      occurredAt: "2026-08-01T00:00:00.000Z",
    });
    await insertAuditRow(database, two.organizationId, {
      id: randomUUID(),
      occurredAt: "2026-08-02T00:00:00.000Z",
    });

    const seenByTwo = await commentsFor(app, two.actors.owner).listAudit("limit=100");

    expect(ids(seenByTwo)).not.toContain(secret);
    expect(JSON.stringify(seenByTwo.body)).not.toContain("secret.action");
    expect(ids(await commentsFor(app, one.actors.owner).listAudit())).toContain(secret);
  });
});
