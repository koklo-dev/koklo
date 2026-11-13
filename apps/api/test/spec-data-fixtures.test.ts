import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { volumeWorld } from "./helpers/long-lists.ts";
import { send, type World } from "./helpers/tickets.ts";

/** TK-107 lot A : `spec.data.fixtures.list` et `spec.data.fixtures.rows` (25 par page) sur `seed:large` et un jeu de 60 lignes. */
let database: TestDatabase;
let app: INestApplication;
let world: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  world = await volumeWorld(database);
  const [snapshot] = await database.query<{ id: string }>(
    `SELECT s.id FROM spec_snapshots s JOIN project_repos r ON r.id = s.repo_id WHERE r.project_id = $1`,
    [world.projectId],
  );
  const lignes = Array.from({ length: 60 }, (_, i) => ({ n: i + 1, nom: `Ligne ${i + 1}` }));
  const data = {
    id: "FX-grand",
    titre: "Grand jeu",
    table: "T-table-001",
    locale: "fr-FR",
    lignes,
  };
  await database.query(
    `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
     VALUES ($1, $2, $3, 'fixture', 'FX-grand', 'data', 'data/fixtures/FX-grand.yaml', $4::jsonb, $5, 3, now(), now())`,
    [randomUUID(), world.organizationId, snapshot?.id, JSON.stringify(data), "b".repeat(64)],
  );
}, 240_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const get = (path: string, actor = world.actors.dev) =>
  send(app, actor.cookie, "get", `/projects/${world.projectId}/spec/data/${path}`);

describe("spec.data.fixtures.list", () => {
  it("rend les jeux dans l'ordre de l'index, avec table, locale et nombre de lignes", async () => {
    const res = await get("fixtures");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((f: { specId: string }) => f.specId)).toEqual([
      "FX-table-001",
      "FX-table-002",
      "FX-grand",
    ]);
    expect(res.body.items[0]).toEqual({
      specId: "FX-table-001",
      title: "Jeu d'exemple 001",
      table: "T-table-001",
      locale: "fr-FR",
      rowCount: 3,
      filePath: "data/fixtures/FX-table-001.yaml",
    });
    expect(res.body.items[2].rowCount).toBe(60);
  });
});

describe("spec.data.fixtures.rows", () => {
  const rows = (id: string, page: number, size = 25) =>
    get(`fixtures/${id}/rows?page=${page}&size=${size}`);

  it("page 2 de 25 : lignes 26 à 50 sur 60, colonnes du jeu", async () => {
    const res = await rows("FX-grand", 2);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(60);
    expect(res.body.totalIsEstimate).toBe(false);
    expect(res.body.columns).toEqual(["n", "nom"]);
    expect(res.body.items).toHaveLength(25);
    expect(res.body.items[0]).toEqual({ n: 26, nom: "Ligne 26" });
    expect(res.body.items[24].n).toBe(50);
  });

  it("dernière page partielle, page au-delà : liste vide, jeu de 3 lignes en une page", async () => {
    expect((await rows("FX-grand", 3)).body.items).toHaveLength(10);
    expect((await rows("FX-grand", 9)).body.items).toEqual([]);
    const small = await rows("FX-table-001", 1);
    expect(small.body.total).toBe(3);
    expect(small.body.items).toEqual([
      { nom: "Léa Martin" },
      { nom: "Karim Haddad" },
      { nom: "Sophie Dubois" },
    ]);
  });

  it("jeu absent : 404 ; taille autre que 25, page 0 ou identifiant mal formé : 400", async () => {
    expect((await rows("FX-absent", 1)).status).toBe(404);
    expect((await rows("FX-grand", 1, 30)).status).toBe(400);
    expect((await rows("FX-grand", 0)).status).toBe(400);
    expect((await rows("grand", 1)).status).toBe(400);
  });
});
