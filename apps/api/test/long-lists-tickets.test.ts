import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { ticketKeys, volumeWorld } from "./helpers/long-lists.ts";
import { apiFor, createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-94 (T11) : `ticket.list` en liste longue sur 500 tickets : total réel, facettes (statut,
 * paquet), recherche, lien direct `around`, une requête par colonne du kanban (filtre de statut),
 * cloisonnement par organisation inchangé.
 */
let database: TestDatabase;
let app: INestApplication;
let world: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  world = await volumeWorld(database);
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const list = (query = "", target: World = world, role: "dev" | "client" = "dev") =>
  apiFor(app, target.actors[role]).listTickets(query);
const encoded = (value: string) => encodeURIComponent(value);
/**
 * Ordre attendu (B42) : priorité décroissante, puis numéro de la clé, puis id. Calculé par une
 * requête indépendante du code testé (pas de colonne générée).
 */
async function expectedKeys(target: World, status?: string): Promise<string[]> {
  const rows = await database.query<{ key: string }>(
    `SELECT key FROM tickets WHERE project_id = $1 AND deleted_at IS NULL
        AND ($2::text IS NULL OR status::text = $2)
      ORDER BY array_position(ARRAY['critical','high','medium','low'], priority::text),
               substring(key from '[0-9]+$')::int, id`,
    [target.projectId, status ?? null],
  );
  return rows.map((row) => row.key);
}
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

describe("total, facettes et pages", () => {
  it("500 tickets : total 500, 50 par défaut dans l'ordre de priorité, offset 0", async () => {
    const res = await list();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(500);
    expect(ticketKeys(res.body)).toEqual((await expectedKeys(world)).slice(0, 50));
    expect(res.body.items.map((t: { priority: string }) => t.priority)[0]).toBe("critical");
    expect(res.body.offset).toBe(0);
    expect(res.body.previousCursor).toBeNull();
    expect(typeof res.body.nextCursor).toBe("string");
  });

  it("facets.status et facets.pkg somment au total", async () => {
    const res = await list("?limit=1");
    expect(sum(res.body.facets.status)).toBe(500);
    expect(sum(res.body.facets.pkg)).toBe(500);
    expect(Object.keys(res.body.facets.status).sort()).toEqual(
      ["backlog", "blocked", "cancelled", "done", "in_progress", "in_review", "todo"].sort(),
    );
  });

  it("colonne du kanban : status=todo&limit=30 donne le total de la colonne (142) et sa suite", async () => {
    const first = await list("?status=todo&limit=30");
    expect(first.body.total).toBe(142);
    expect(first.body.items).toHaveLength(30);
    expect(first.body.items.every((t: { status: string }) => t.status === "todo")).toBe(true);
    expect(sum(first.body.facets.status)).toBe(500);
    const second = await list(`?status=todo&limit=30&cursor=${encoded(first.body.nextCursor)}`);
    expect(second.body.offset).toBe(30);
    expect(second.body.total).toBe(142);
    const keys = new Set([...ticketKeys(first.body), ...ticketKeys(second.body)]);
    expect(keys.size).toBe(60);
  });

  it("toutes les pages d'une colonne : aucun doublon, total atteint", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await list(`?status=todo&limit=100${cursor ? `&cursor=${encoded(cursor)}` : ""}`);
      seen.push(...ticketKeys(res.body));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(142);
    expect(new Set(seen).size).toBe(142);
  });

  it("une colonne vide : total 0, aucun curseur", async () => {
    await database.query(
      "UPDATE tickets SET status = 'todo' WHERE project_id = $1 AND status = 'blocked'",
      [world.projectId],
    );
    const res = await list("?status=blocked");
    expect(res.body).toMatchObject({ items: [], total: 0, nextCursor: null, previousCursor: null });
  });
});

describe("ordre par défaut : priorité décroissante côté serveur (B42)", () => {
  it("la colonne todo, page après page, suit l'ordre global priorité puis clé", async () => {
    const expected = await expectedKeys(world, "todo");
    const seen: string[] = [];
    const priorities: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await list(`?status=todo&limit=30${cursor ? `&cursor=${encoded(cursor)}` : ""}`);
      seen.push(...ticketKeys(res.body));
      priorities.push(...res.body.items.map((t: { priority: string }) => t.priority));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(expected);
    const rank = ["critical", "high", "medium", "low"];
    const ranks = priorities.map((p) => rank.indexOf(p));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("remonter par previousCursor redonne la page précédente dans le même ordre", async () => {
    const expected = await expectedKeys(world);
    const second = await list(`?limit=50&around=${expected[75]}`);
    expect(ticketKeys(second.body)).toEqual(expected.slice(50, 100));
    const before = await list(`?limit=50&cursor=${encoded(second.body.previousCursor)}`);
    expect(ticketKeys(before.body)).toEqual(expected.slice(0, 50));
  });
});

describe("recherche et filtres côté serveur", () => {
  it("« annulation groupée » trouve le ticket connu, hors de la première page", async () => {
    const res = await list(`?q=${encoded("annulation groupée")}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].key).toBe("TK-313");
  });

  it("la clé est cherchable : « TK-420 »", async () => {
    const res = await list(`?q=${encoded("TK-420")}`);
    expect(ticketKeys(res.body)).toContain("TK-420");
  });

  it("recherche + statut + paquet : total de la liste filtrée", async () => {
    const [expected] = await database.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tickets WHERE project_id = $1 AND status = 'done'
          AND pkg = 'api' AND title ILIKE 'Gérer %'`,
      [world.projectId],
    );
    const res = await list("?q=gérer&status=done&pkg=api&limit=100");
    expect(res.body.total).toBe(expected?.n);
    expect(res.body.facets.status).toBeDefined();
  });

  it("les tickets supprimés ne sont ni comptés ni cherchés", async () => {
    const mine = await volumeWorld(database);
    await database.query(
      "UPDATE tickets SET deleted_at = now() WHERE project_id = $1 AND key = 'TK-313'",
      [mine.projectId],
    );
    const res = await list(`?q=${encoded("annulation groupée")}`, mine);
    expect(res.body.total).toBe(0);
    expect((await list("?limit=1", mine)).body.total).toBe(499);
  });

  it("caractères spéciaux de tsquery : 200, jamais 500", async () => {
    for (const q of ["& | ! ( ) : '", "annul:*)", "'; DROP TABLE tickets; --"]) {
      const res = await list(`?q=${encoded(q)}`);
      expect(res.status, q).toBe(200);
    }
  });
});

describe("around : lien direct vers un ticket hors première page", () => {
  it("around=TK-420 : la fenêtre alignée contient TK-420, page précédente disponible", async () => {
    const expected = await expectedKeys(world);
    const rank = expected.indexOf("TK-420");
    const start = rank - (rank % 50);
    const res = await list("?around=TK-420&limit=50");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(ticketKeys(res.body)).toEqual(expected.slice(start, start + 50));
    expect(ticketKeys(res.body)).toContain("TK-420");
    expect(res.body.offset).toBe(start);
    expect(typeof res.body.previousCursor).toBe("string");
    const before = await list(`?limit=50&cursor=${encoded(res.body.previousCursor)}`);
    expect(ticketKeys(before.body)).toEqual(expected.slice(start - 50, start));
  });

  it("around inconnu : 404 NOT_FOUND ; around avec cursor : refusé", async () => {
    const unknown = await list("?around=TK-9999");
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("NOT_FOUND");
    const both = await list(`?around=TK-1&cursor=${encoded("x")}`);
    expect(both.status).toBe(400);
  });

  it("un ticket supprimé n'est pas joignable par around", async () => {
    const mine = await volumeWorld(database);
    await database.query(
      "UPDATE tickets SET deleted_at = now() WHERE project_id = $1 AND key = 'TK-420'",
      [mine.projectId],
    );
    expect((await list("?around=TK-420", mine)).status).toBe(404);
  });
});

describe("cloisonnement", () => {
  it("une autre organisation ne voit ni le total, ni les facettes, ni around du volume", async () => {
    const other = await createWorld(database);
    const res = await list("", other);
    expect(res.body).toMatchObject({ items: [], total: 0, offset: 0 });
    expect((await list("?around=TK-420", other)).status).toBe(404);
    expect((await list(`?q=${encoded("annulation groupée")}`, other)).body.total).toBe(0);
  });

  it("le client lié lit les mêmes listes (lecture seule)", async () => {
    const res = await list("?limit=10", world, "client");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(500);
  });
});
