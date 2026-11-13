import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { volumeWorld } from "./helpers/long-lists.ts";
import { send, type World } from "./helpers/tickets.ts";

/**
 * TK-107 lot A (B388, B389) : `spec.data.tables.list` sur `seed:large` (80 tables au format v2), `spec.item.get` de type
 * `table` avec `referencedBy`, compteurs `relations` et `fixtures` de `spec.head`.
 */
let database: TestDatabase;
let app: INestApplication;
let world: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  world = await volumeWorld(database);
}, 240_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const get = (path: string, actor = world.actors.dev) =>
  send(app, actor.cookie, "get", `/projects/${world.projectId}/spec/${path}`);
const tables = (query = "") => get(`data/tables${query === "" ? "" : `?${query}`}`);
const idsOf = (body: { items: { specId: string }[] }) => body.items.map((item) => item.specId);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `T-table-${String(from + i).padStart(3, "0")}`);
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.data.tables.list", () => {
  it("80 tables, page de 50 : total 80, première page sous 300 ms, curseur vers les 30 suivantes", async () => {
    await tables("limit=1");
    const timings: number[] = [];
    let res = await tables();
    for (let run = 0; run < 3; run += 1) {
      const start = performance.now();
      res = await tables();
      timings.push(performance.now() - start);
    }
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(80);
    expect(idsOf(res.body)).toEqual(range(1, 50));
    expect(res.body.offset).toBe(0);
    expect(res.body.previousCursor).toBeNull();
    expect(typeof res.body.nextCursor).toBe("string");
    expect(Math.min(...timings)).toBeLessThan(300);
    const next = await tables(`cursor=${res.body.nextCursor}`);
    expect(idsOf(next.body)).toEqual(range(51, 80));
    expect(next.body.nextCursor).toBeNull();
    expect(next.body.offset).toBe(50);
  });

  it("une ligne : nom, zone, champs, relations des deux côtés, utilisée par, données personnelles", async () => {
    const res = await tables("limit=100");
    const by = (id: string) => res.body.items.find((t: { specId: string }) => t.specId === id);
    expect(by("T-table-004")).toMatchObject({
      specId: "T-table-004",
      name: "Table 004",
      zone: expect.any(String),
      fieldCount: 5,
      personalData: true,
      filePath: "data/tables/table-004.yaml",
    });
    expect(by("T-table-004").usedBy).toEqual([expect.stringMatching(/^F-\d{3}$/)]);
    expect(by("T-table-003").personalData).toBe(false);
    expect(by("T-table-003").fieldCount).toBe(4);
    // Une relation est déclarée une fois (B384) et comptée des deux côtés.
    expect(by("T-table-001").relationCount).toBe(1);
    expect(by("T-table-002").relationCount).toBe(2);
    expect(by("T-table-080").relationCount).toBe(1);
  });

  it("recherche sur le nom d'une table non chargée (page 2) et sur un nom de champ", async () => {
    const byName = await tables("q=Table%20070");
    expect(idsOf(byName.body)).toContain("T-table-070");
    const byField = await tables("q=email&limit=5");
    expect(byField.body.total).toBe(20);
    expect(byField.body.items).toHaveLength(5);
    const last = await tables(`q=email&limit=5&around=T-table-080`);
    expect(idsOf(last.body)).toContain("T-table-080");
    expect(last.body.total).toBe(20);
  });

  it("une saisie à jokers ou à syntaxe SQL ne casse rien et ne trouve rien", async () => {
    for (const q of ["100%", "a_b", "'; DROP TABLE spec_entities; --", "&|!"]) {
      const res = await tables(`q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(res.body.total, q).toBe(0);
    }
  });

  it("filtre de zone sur toute la tête, avec facette par zone", async () => {
    const all = await tables();
    expect(sum(all.body.facets.zone)).toBe(80);
    const zones = Object.keys(all.body.facets.zone);
    expect(zones.length).toBeGreaterThanOrEqual(5);
    const zone = zones[0] as string;
    const res = await tables(`zone=${encodeURIComponent(zone)}&limit=100`);
    expect(res.body.total).toBe(all.body.facets.zone[zone]);
    expect(res.body.items.every((t: { zone: string }) => t.zone === zone)).toBe(true);
  });

  it("around=T-table-070 : la page qui contient la table, hors page 1", async () => {
    const res = await tables("around=T-table-070");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(idsOf(res.body)).toContain("T-table-070");
    expect(res.body.offset).toBe(50);
    expect((await tables("around=T-table-999")).status).toBe(404);
  });

  it("entrées refusées : around avec curseur, révision double, identifiant mal formé", async () => {
    expect((await tables("around=T-table-070&cursor=x")).status).toBe(400);
    expect((await tables(`branch=a&commitSha=${"a".repeat(40)}`)).status).toBe(400);
    expect((await tables("around=table-070")).status).toBe(400);
  });
});

describe("spec.item.get : table", () => {
  it("rend la fiche de la table et les éléments qui la citent", async () => {
    const res = await get("items/table/T-table-070");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      type: "table",
      id: "T-table-070",
      values: {
        specId: "T-table-070",
        name: "Table 070",
        zone: expect.any(String),
        sources: [expect.stringMatching(/^F-\d{3}$/)],
        relations: [{ to: "T-table-069", cardinality: "n → 1" }],
        filePath: "data/tables/table-070.yaml",
      },
    });
    expect(res.body.values.fields[0]).toEqual({
      name: "id",
      type: "uuid",
      primaryKey: true,
      personalData: false,
    });
    expect(res.body.values.fields.map((f: { name: string }) => f.name)).toContain("parent_id");
    const refs = res.body.referencedBy.items.map((i: { specId: string }) => i.specId);
    expect(refs).toContain("T-table-071");
    expect(res.body.referencedBy.total).toBeGreaterThanOrEqual(1);
  });

  it("une table absente : 404", async () => {
    expect((await get("items/table/T-table-999")).status).toBe(404);
  });
});

describe("spec.head : compteurs de données", () => {
  it("tables, relations déclarées (79) et jeux d'exemple (2)", async () => {
    const res = await get("");
    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ tables: 80, relations: 79, fixtures: 2 });
  });
});
