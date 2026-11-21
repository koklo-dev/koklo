import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { volumeWorld } from "./helpers/long-lists.ts";
import { send, type World } from "./helpers/tickets.ts";

/**
 * TK-111 lot B (cas 7, B510) : `spec.architecture.components.list` sur `seed:large` (120 composants), `spec.item.get` de type
 * `component` avec `referencedBy`, compteur `components` de `spec.head`, avertissements `spec.architecture.checks` (200 même
 * avec des avertissements : jamais bloquants).
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
const components = (query = "") => get(`architecture/components${query === "" ? "" : `?${query}`}`);
const idsOf = (body: { items: { specId: string }[] }) => body.items.map((item) => item.specId);
const range = (from: number, to: number) =>
  Array.from(
    { length: to - from + 1 },
    (_, i) => `C-composant-${String(from + i).padStart(3, "0")}`,
  );
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.architecture.components.list", () => {
  it("120 composants, page de 50 : total 120, curseur vers les 50 suivants puis les 20 derniers", async () => {
    const first = await components();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.total).toBe(120);
    expect(idsOf(first.body)).toEqual(range(1, 50));
    expect(first.body.offset).toBe(0);
    expect(first.body.previousCursor).toBeNull();
    const second = await components(`cursor=${first.body.nextCursor}`);
    expect(idsOf(second.body)).toEqual(range(51, 100));
    const third = await components(`cursor=${second.body.nextCursor}`);
    expect(idsOf(third.body)).toEqual(range(101, 120));
    expect(third.body.nextCursor).toBeNull();
    expect(third.body.offset).toBe(100);
  });

  it("une ligne : nom, type, zone, responsabilité (1re ligne), dépendances, décisions, fichier", async () => {
    const res = await components("limit=100");
    const row = res.body.items.find((c: { specId: string }) => c.specId === "C-composant-004");
    expect(row).toEqual({
      specId: "C-composant-004",
      name: "Composant 004",
      type: "ext",
      zone: expect.any(String),
      responsibility: "Responsabilité du composant 004.",
      dependsOnCount: 1,
      decisions: [],
      filePath: "architecture/components/composant-004.yaml",
    });
    expect(
      res.body.items.find((c: { specId: string }) => c.specId === "C-composant-001").dependsOnCount,
    ).toBe(0);
  });

  it("recherche sur un composant non chargé (page 3) ; saisie à jokers ou à syntaxe SQL : rien, jamais d'erreur", async () => {
    const byName = await components("q=Composant%20110");
    expect(idsOf(byName.body)).toContain("C-composant-110");
    for (const q of ["999%", "a_b", "'; DROP TABLE spec_entities; --", "&|!"]) {
      const res = await components(`q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(res.body.total, q).toBe(0);
    }
  });

  it("filtre de zone sur toute la tête, avec facette par zone ; around amène un composant hors page 1", async () => {
    const all = await components();
    expect(sum(all.body.facets.zone)).toBe(120);
    const zone = Object.keys(all.body.facets.zone)[0] as string;
    const filtered = await components(`zone=${encodeURIComponent(zone)}&limit=100`);
    expect(filtered.body.total).toBe(all.body.facets.zone[zone]);
    expect(filtered.body.items.every((c: { zone: string }) => c.zone === zone)).toBe(true);
    const around = await components("around=C-composant-110");
    expect(idsOf(around.body)).toContain("C-composant-110");
    expect(around.body.offset).toBe(100);
    expect((await components("around=C-composant-999")).status).toBe(404);
  });

  it("entrées refusées : around avec curseur, révision double, identifiant mal formé", async () => {
    expect((await components("around=C-composant-070&cursor=x")).status).toBe(400);
    expect((await components(`branch=a&commitSha=${"a".repeat(40)}`)).status).toBe(400);
    expect((await components("around=composant-070")).status).toBe(400);
  });
});

describe("spec.item.get : composant", () => {
  it("rend la fiche en anglais (dépendances, asynchrone, tables possédées) et les éléments qui la citent", async () => {
    const res = await get("items/component/C-composant-006");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      type: "component",
      id: "C-composant-006",
      values: {
        specId: "C-composant-006",
        name: "Composant 006",
        type: "app",
        responsibility: "Responsabilité du composant 006.",
        owns: ["T-table-006"],
        serves: [expect.stringMatching(/^F-\d{3}$/)],
        dependsOn: [{ to: "C-composant-005", via: "HTTP", async: true }],
        filePath: "architecture/components/composant-006.yaml",
      },
    });
    const refs = res.body.referencedBy.items.map((i: { specId: string }) => i.specId);
    expect(refs).toContain("C-composant-007");
  });

  it("un composant absent : 404 ; un identifiant d'un autre genre : 400", async () => {
    expect((await get("items/component/C-composant-999")).status).toBe(404);
    expect((await get("items/component/T-table-001")).status).toBe(400);
  });
});

describe("spec.head et spec.architecture.checks", () => {
  it("spec.head : 120 composants", async () => {
    const res = await get("");
    expect(res.status).toBe(200);
    expect(res.body.counts.components).toBe(120);
  });

  it("checks : 200 avec des avertissements (parcours sans flux, table sans propriétaire), aucun cycle synchrone", async () => {
    const res = await get("architecture/checks");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const codes = res.body.warnings.map((w: { code: string }) => w.code);
    expect(codes.filter((c: string) => c === "ARCH_FLOW_MISSING")).toHaveLength(18);
    expect(codes).toContain("ARCH_TABLE_UNOWNED");
    expect(codes).toContain("ARCH_FEATURE_UNSERVED");
    expect(codes).not.toContain("ARCH_SYNC_CYCLE");
    expect(JSON.stringify(res.body)).not.toMatch(/mermaid|yaml/i);
  });
});
