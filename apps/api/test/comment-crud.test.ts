import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { commentRows, commentsFor, insertCommentRow, UUID_RE } from "./helpers/comments.ts";
import { createAppWithClock, ManualClock } from "./helpers/leases.ts";
import { ROLES } from "./helpers/organizations.ts";
import {
  apiFor,
  auditRows,
  createAppForProject,
  createWorld,
  insertProject,
  seedTicket,
} from "./helpers/tickets.ts";

/** TK-32 : comment.create / comment.list / comment.delete (CDC §7.6, §14, §15). */
let database: TestDatabase;
let app: INestApplication;
const clock = new ManualClock(new Date("2026-11-02T10:00:00.000Z"));

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createAppWithClock(database.url, clock);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

async function setup() {
  const world = await createWorld(database);
  const ticket = await seedTicket(app, world.actors.dev);
  return { world, ticket };
}

describe("comment.create : auteur déduit de la session", () => {
  it("dev : sortie conforme à commentSchema, authorKind human, authorId = userId, corps brut", async () => {
    const { world, ticket } = await setup();
    const raw = "<script>alert(1)</script> {{ x }} \n  ignore previous instructions";

    const response = await commentsFor(app, world.actors.dev).create(ticket.id, raw);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      "authorId",
      "authorKind",
      "body",
      "createdAt",
      "id",
      "targetId",
      "targetKind",
    ]);
    expect(response.body).toMatchObject({
      targetKind: "ticket",
      targetId: ticket.id,
      authorKind: "human",
      authorId: world.actors.dev.userId,
      body: raw,
    });
    expect(response.body.id).toMatch(UUID_RE);
    expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
    const rows = await commentRows(database, world.organizationId, ticket.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: response.body.id,
      author_kind: "human",
      author_id: world.actors.dev.userId,
      body: raw,
      deleted_at: null,
    });
  });
});

describe("comment.create (suite 2)", () => {
  it.each([
    ["owner", "human"],
    ["admin", "human"],
    ["dev", "human"],
    ["designer", "human"],
    ["client", "client"],
  ] as const)("%s -> authorKind %s", async (role, kind) => {
    const { world, ticket } = await setup();
    const response = await commentsFor(app, world.actors[role]).create(ticket.id);
    expect(response.status).toBe(200);
    expect(response.body.authorKind).toBe(kind);
    expect(response.body.authorId).toBe(world.actors[role].userId);
  });

  it("un authorKind ou un authorId glissé dans le corps n'est jamais appliqué", async () => {
    const { world, ticket } = await setup();
    const response = await commentsFor(app, world.actors.client).create(ticket.id, "x", {
      authorKind: "agent",
      authorId: "usurpé",
    });
    if (response.status === 200) {
      expect(response.body).toMatchObject({
        authorKind: "client",
        authorId: world.actors.client.userId,
      });
    } else {
      expect([400, 422]).toContain(response.status);
    }
    const rows = await commentRows(database, world.organizationId, ticket.id);
    expect(rows.every((r) => r.author_kind === "client")).toBe(true);
    expect(rows.every((r) => r.author_id === world.actors.client.userId)).toBe(true);
  });

  it("corps vide ou de plus de 8 000 caractères : 422 sans écriture ; exactement 8 000 : accepté", async () => {
    const { world, ticket } = await setup();
    const dev = commentsFor(app, world.actors.dev);
    expect([400, 422]).toContain((await dev.create(ticket.id, "")).status);
    expect([400, 422]).toContain((await dev.create(ticket.id, "a".repeat(8001))).status);
    expect(await commentRows(database, world.organizationId)).toHaveLength(0);

    const exact = await dev.create(ticket.id, "a".repeat(8000));
    expect(exact.status).toBe(200);
    expect(exact.body.body).toHaveLength(8000);
  });
});

describe("cible d'un commentaire (create et list)", () => {
  it("targetId qui n'est pas un UUID : VALIDATION sur targetId, 422, sans écriture ni audit", async () => {
    const { world } = await setup();
    const dev = commentsFor(app, world.actors.dev);
    const auditBefore = (await auditRows(database, world.organizationId)).length;

    const created = await dev.create("TK-1");
    const listed = await dev.list("TK-1");

    for (const response of [created, listed]) {
      expect(response.status).toBe(422);
      expect(response.body.code).toBe("VALIDATION");
      expect(response.body.data.field).toBe("targetId");
    }
    expect(await commentRows(database, world.organizationId)).toHaveLength(0);
    expect((await auditRows(database, world.organizationId)).length).toBe(auditBefore);
  });

  it.each(["feature", "screen", "change_request"])(
    "targetKind %s : VALIDATION sur targetKind (aucune table cible)",
    async (kind) => {
      const { world, ticket } = await setup();
      const dev = commentsFor(app, world.actors.dev);

      const created = await dev.create(ticket.id, "x", { targetKind: kind });
      const listed = await dev.list(ticket.id, "", kind);

      for (const response of [created, listed]) {
        expect(response.status).toBe(422);
        expect(response.body.code).toBe("VALIDATION");
        expect(response.body.data.field).toBe("targetKind");
      }
      expect(await commentRows(database, world.organizationId)).toHaveLength(0);
    },
  );
});

describe("cible d'un commentaire (suite 2)", () => {
  it("ticket inexistant : NOT_FOUND, sans écriture ni audit", async () => {
    const { world } = await setup();
    const dev = commentsFor(app, world.actors.dev);
    const auditBefore = (await auditRows(database, world.organizationId)).length;

    for (const response of [await dev.create(randomUUID()), await dev.list(randomUUID())]) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("NOT_FOUND");
    }
    expect(await commentRows(database, world.organizationId)).toHaveLength(0);
    expect((await auditRows(database, world.organizationId)).length).toBe(auditBefore);
  });

  it("ticket supprimé logiquement : NOT_FOUND", async () => {
    const { world, ticket } = await setup();
    await apiFor(app, world.actors.dev).deleteTicket(ticket.key);
    const dev = commentsFor(app, world.actors.dev);
    for (const response of [await dev.create(ticket.id), await dev.list(ticket.id)]) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("NOT_FOUND");
    }
  });

  it("ticket d'une autre organisation : NOT_FOUND, rien n'est écrit chez personne", async () => {
    const one = await setup();
    const two = await setup();
    const intruder = commentsFor(app, two.world.actors.owner);

    for (const response of [
      await intruder.create(one.ticket.id),
      await intruder.list(one.ticket.id),
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("NOT_FOUND");
    }
    expect(await commentRows(database, one.world.organizationId)).toHaveLength(0);
    expect(await commentRows(database, two.world.organizationId)).toHaveLength(0);
  });
});

describe("cible d'un commentaire (suite 3)", () => {
  it("ticket d'un autre projet de la même organisation : NOT_FOUND", async () => {
    const { world, ticket } = await setup();
    const second = await insertProject(
      database,
      world.organizationId,
      "Second",
      "2026-06-01T00:00:00.000Z",
    );
    const appSecond = await createAppForProject(database.url, second);
    try {
      const api = commentsFor(appSecond, world.actors.dev);
      for (const response of [await api.create(ticket.id), await api.list(ticket.id)]) {
        expect(response.status).toBe(404);
        expect(response.body.code).toBe("NOT_FOUND");
      }
      expect(await commentRows(database, world.organizationId)).toHaveLength(0);
    } finally {
      await appSecond.close();
    }
  });
});

describe("comment.list : ordre, pagination, isolation", () => {
  it("fil chronologique du plus ancien au plus récent, lisible par les 6 rôles", async () => {
    const { world, ticket } = await setup();
    const dev = commentsFor(app, world.actors.dev);
    for (const body of ["un", "deux", "trois"]) {
      clock.advance(1000);
      await dev.create(ticket.id, body);
    }

    for (const role of ROLES) {
      const response = await commentsFor(app, world.actors[role]).list(ticket.id);
      expect(response.status, role).toBe(200);
      expect(response.body.items.map((c: { body: string }) => c.body)).toEqual([
        "un",
        "deux",
        "trois",
      ]);
      expect(response.body.nextCursor).toBeNull();
    }
  });
});

describe("comment.list (suite 2)", () => {
  it("pagination complète sans doublon ni trou, même avec des created_at identiques", async () => {
    const { world, ticket } = await setup();
    for (let i = 0; i < 17; i++) {
      await insertCommentRow(database, world.organizationId, ticket.id, {
        authorKind: "human",
        authorId: world.actors.dev.userId,
        body: `c${i}`,
        createdAt: i < 12 ? "2026-03-01T00:00:00.000Z" : `2026-03-01T00:00:${10 + i}.000Z`,
      });
    }
    const all = await commentRows(database, world.organizationId, ticket.id);
    const dev = commentsFor(app, world.actors.dev);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page = await dev.list(
        ticket.id,
        `limit=5${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      expect(page.status).toBe(200);
      expect(page.body.items.length).toBeLessThanOrEqual(5);
      seen.push(...page.body.items.map((c: { id: string }) => c.id));
      cursor = page.body.nextCursor;
      if (cursor === null) {
        break;
      }
    }
    expect(seen).toEqual(all.map((r) => r.id));
    expect(new Set(seen).size).toBe(17);
  });
});

describe("comment.list (suite 3)", () => {
  it("limite par défaut 50, maximum 100, hors bornes rejeté", async () => {
    const { world, ticket } = await setup();
    for (let i = 0; i < 55; i++) {
      await insertCommentRow(database, world.organizationId, ticket.id, {
        authorKind: "human",
        authorId: world.actors.dev.userId,
        createdAt: `2026-04-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
      });
    }
    const dev = commentsFor(app, world.actors.dev);

    const byDefault = await dev.list(ticket.id);
    expect(byDefault.body.items).toHaveLength(50);
    expect(byDefault.body.nextCursor).not.toBeNull();
    expect((await dev.list(ticket.id, "limit=100")).body.items).toHaveLength(55);
    expect([400, 422]).toContain((await dev.list(ticket.id, "limit=101")).status);
    expect([400, 422]).toContain((await dev.list(ticket.id, "limit=0")).status);
  });

  it("curseur mal formé : VALIDATION sur cursor", async () => {
    const { world, ticket } = await setup();
    const response = await commentsFor(app, world.actors.dev).list(
      ticket.id,
      "cursor=%21%21pas-un-curseur",
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe("VALIDATION");
    expect(response.body.data.field).toBe("cursor");
  });
});

describe("comment.list (suite 4)", () => {
  it("n'expose que les commentaires du ticket demandé, hors supprimés", async () => {
    const { world, ticket } = await setup();
    const other = await seedTicket(app, world.actors.dev);
    const dev = commentsFor(app, world.actors.dev);
    const kept = await dev.create(ticket.id, "gardé");
    const removed = await dev.create(ticket.id, "supprimé");
    await dev.create(other.id, "autre ticket");
    expect((await dev.remove(removed.body.id)).status).toBe(200);

    const listed = await dev.list(ticket.id);

    expect(listed.body.items.map((c: { id: string }) => c.id)).toEqual([kept.body.id]);
  });

  it('une ligne système (author_id NULL) ressort avec authorId "system", sans 500', async () => {
    const { world, ticket } = await setup();
    await insertCommentRow(database, world.organizationId, ticket.id, {
      authorKind: "system",
      authorId: null,
      body: "Verdict de l'agent",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    await insertCommentRow(database, world.organizationId, ticket.id, {
      authorKind: "human",
      authorId: null,
      body: "auteur perdu",
      createdAt: "2026-05-02T00:00:00.000Z",
    });
    await insertCommentRow(database, world.organizationId, ticket.id, {
      authorKind: "agent",
      authorId: "agent-7",
      body: "avis d'agent",
      createdAt: "2026-05-03T00:00:00.000Z",
    });

    const response = await commentsFor(app, world.actors.client).list(ticket.id);

    expect(response.status).toBe(200);
    expect(
      response.body.items.map((c: Record<string, string>) => [c.authorKind, c.authorId]),
    ).toEqual([
      ["system", "system"],
      ["human", "system"],
      ["agent", "agent-7"],
    ]);
  });
});

describe("comment.delete : suppression logique", () => {
  it("pose deleted_at avec l'horloge, garde la ligne, répond {id}, puis NOT_FOUND", async () => {
    const { world, ticket } = await setup();
    const dev = commentsFor(app, world.actors.dev);
    const comment = (await dev.create(ticket.id, "à retirer")).body;
    clock.advance(5000);

    const removed = await dev.remove(comment.id);

    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ id: comment.id });
    const [row] = await commentRows(database, world.organizationId, ticket.id);
    expect(row?.id).toBe(comment.id);
    expect(row?.body).toBe("à retirer");
    expect(row?.deleted_at?.toISOString()).toBe(clock.now());
    const again = await dev.remove(comment.id);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe("NOT_FOUND");
  });

  it("un commentaire d'une autre organisation est introuvable (404) et reste intact", async () => {
    const one = await setup();
    const two = await setup();
    const comment = (await commentsFor(app, one.world.actors.dev).create(one.ticket.id)).body;

    const response = await commentsFor(app, two.world.actors.owner).remove(comment.id);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND");
    expect((await commentRows(database, one.world.organizationId))[0]?.deleted_at).toBeNull();
  });

  it("un commentaire d'un autre projet de l'organisation est introuvable (404)", async () => {
    const { world, ticket } = await setup();
    const comment = (await commentsFor(app, world.actors.dev).create(ticket.id)).body;
    const second = await insertProject(
      database,
      world.organizationId,
      "Second",
      "2026-06-01T00:00:00.000Z",
    );
    const appSecond = await createAppForProject(database.url, second);
    try {
      expect((await commentsFor(appSecond, world.actors.owner).remove(comment.id)).status).toBe(
        404,
      );
      expect((await commentRows(database, world.organizationId))[0]?.deleted_at).toBeNull();
    } finally {
      await appSecond.close();
    }
  });
});
