import { seedPlanche } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { volumeWorld } from "./helpers/long-lists.ts";
import { createWorld, send, type World } from "./helpers/tickets.ts";

/**
 * TK-110 lot A (B482, B483) : `spec.data.zones`, `spec.data.zone` et `spec.data.search` sur `seed:planche` (65 tables en 6
 * zones : 6, 9, 18, 7, 14 et 11) et `seed:large` (80 tables, recherche d'une table au-delà des 100 premières).
 */
let database: TestDatabase;
let app: INestApplication;
let planche: World;
let large: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  planche = await createWorld(database);
  await seedPlanche(database.url, {
    target: { organizationId: planche.organizationId, projectId: planche.projectId },
  });
  large = await volumeWorld(database);
}, 300_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const get = (world: World, path: string, actor = world.actors.dev) =>
  send(app, actor.cookie, "get", `/projects/${world.projectId}/spec/data/${path}`);
const RDV = "prise-de-rendez-vous";

describe("spec.data.zones", () => {
  it("65 tables en 6 zones, comptes 6, 9, 18, 7, 14 et 11, dans l'ordre des tables", async () => {
    const res = await get(planche, "zones");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.tableCount).toBe(65);
    expect(res.body.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(res.body.zones.map((zone: { tableCount: number }) => zone.tableCount)).toEqual([
      6, 9, 18, 7, 14, 11,
    ]);
    expect(res.body.zones[0]).toMatchObject({
      id: RDV,
      name: "Prise de rendez-vous",
      icon: "folder_open",
    });
  });

  it("aperçu de 7 noms au plus, liens entre zones = relations entre zones (17 depuis les rendez-vous)", async () => {
    const { zones } = (await get(planche, "zones")).body as {
      zones: {
        id: string;
        preview: string[];
        links: { to: string; count: number }[];
      }[];
    };
    for (const zone of zones) expect(zone.preview.length).toBeLessThanOrEqual(7);
    expect(zones[0]?.preview).toEqual([
      "Table 001",
      "Table 002",
      "Table 003",
      "Table 004",
      "Table 005",
      "Table 006",
    ]);
    const sum = (id: string) =>
      (zones.find((zone) => zone.id === id)?.links ?? []).reduce((n, link) => n + link.count, 0);
    expect(sum(RDV)).toBe(17);
    expect(sum("paiement-et-caisse")).toBe(16);
    const toCli = zones[0]?.links.find((link) => link.to === "clients-et-fidelite");
    const back = zones[1]?.links.find((link) => link.to === RDV);
    expect(toCli?.count).toBe(4);
    expect(back?.count).toBe(4);
  });

  it("lecture seule d'équipe : première réponse sous 300 ms sur 80 tables", async () => {
    await get(large, "zones");
    const timings: number[] = [];
    for (let run = 0; run < 3; run += 1) {
      const start = performance.now();
      await get(large, "zones");
      timings.push(performance.now() - start);
    }
    expect(Math.min(...timings)).toBeLessThan(300);
  });
});

describe("spec.data.zone", () => {
  it("la zone des rendez-vous : 6 tables, relations internes, 17 liens vers d'autres zones", async () => {
    const res = await get(planche, `zone?zone=${RDV}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.zone).toEqual({
      id: RDV,
      name: "Prise de rendez-vous",
      icon: "folder_open",
      tableCount: 6,
    });
    expect(res.body.tables.map((t: { specId: string }) => t.specId)).toEqual([
      "T-table-001",
      "T-table-002",
      "T-table-003",
      "T-table-004",
      "T-table-005",
      "T-table-006",
    ]);
    expect(res.body.tables[3]).toMatchObject({
      name: "Table 004",
      personalData: true,
      fields: expect.arrayContaining([
        { name: "id", type: "uuid", primaryKey: true, personalData: false },
      ]),
    });
    expect(res.body.relations).toEqual(
      expect.arrayContaining([{ from: "T-table-002", to: "T-table-001", cardinality: "n → 1" }]),
    );
    const outgoing = res.body.outgoing as { zone: string; count: number }[];
    expect(outgoing.reduce((n, link) => n + link.count, 0)).toBe(17);
    expect(outgoing[0]).toEqual({ zone: "paiement-et-caisse", count: 5 });
    expect(res.body.truncated).toBe(false);
  });

  it("zone inconnue : 404 ; paramètre zone absent : 400", async () => {
    expect((await get(planche, "zone?zone=inconnue")).status).toBe(404);
    expect((await get(planche, "zone")).status).toBe(400);
  });

  it("plus de 200 tables dans une zone : 200 rendues, truncated, compte complet", async () => {
    const [snapshot] = await database.query<{ id: string }>(
      `SELECT s.id FROM spec_snapshots s JOIN project_repos r ON r.id = s.repo_id WHERE r.project_id = $1`,
      [planche.projectId],
    );
    await database.query(
      `INSERT INTO spec_entities (id, organization_id, snapshot_id, kind, spec_id, zone, path, data, content_hash, sort, created_at, updated_at)
       SELECT gen_random_uuid(), $1::uuid, $2::uuid, 'table', 'T-vaste-' || lpad(n::text, 3, '0'), NULL,
              'data/tables/vaste-' || n || '.yaml',
              jsonb_build_object('id', 'T-vaste-' || lpad(n::text, 3, '0'), 'nom', 'Vaste ' || n, 'zone', 'Zone vaste',
                'champs', jsonb_build_array(jsonb_build_object('nom', 'id', 'type', 'uuid'))),
              repeat('c', 64), 1000 + n, now(), now()
         FROM generate_series(1, 230) AS n`,
      [planche.organizationId, snapshot?.id],
    );
    const res = await get(planche, "zone?zone=zone-vaste");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.tables).toHaveLength(200);
    expect(res.body.truncated).toBe(true);
    expect(res.body.zone.tableCount).toBe(230);
  });
});

describe("spec.data.search", () => {
  it("trouve une table non chargée (au-delà des 100 premières) par son nom", async () => {
    const res = await get(large, "search?q=Table%20080");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toContain("T-table-080");
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^T-table-\d{3}$/),
        name: expect.any(String),
      }),
    );
  });

  it("trouve par nom de champ ; 20 résultats au plus", async () => {
    const res = await get(large, "search?q=email");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(20);
    const zoned = res.body.items.every((item: { zone?: string }) => typeof item.zone === "string");
    expect(zoned).toBe(true);
  });

  it("aucun résultat : liste vide ; q vide ou absent : 400 ; saisie à syntaxe SQL : rien ne casse", async () => {
    expect((await get(large, "search?q=zzzzzzzz")).body).toEqual({ items: [] });
    expect((await get(large, "search?q=")).status).toBe(400);
    expect((await get(large, "search")).status).toBe(400);
    for (const q of ["100%", "a_b", "'; DROP TABLE spec_entities; --", "&|!"]) {
      const res = await get(large, `search?q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
    }
  });
});
