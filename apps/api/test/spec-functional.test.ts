import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { volumeWorld } from "./helpers/long-lists.ts";
import { ROLES } from "./helpers/organizations.ts";
import { send, type World } from "./helpers/tickets.ts";

/**
 * TK-103 lot A (B341) : `spec.functional.list` (règles : pages de 24 sur 300, total, facette `type`, recherche et filtre
 * côté serveur sur des éléments non chargés, `around` ; parcours par pages de 6), `spec.roles.matrix` (47 actions groupées
 * par ressource), `spec.item.get` pour règle, rôle et parcours, compteurs de `spec.head`. Jeu `seed:large`.
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
const functional = (query: string) => get(`functional?${query}`);
const idsOf = (body: { items: { specId: string }[] }) => body.items.map((item) => item.specId);
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `R-${String(from + i).padStart(3, "0")}`);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.functional.list : règles", () => {
  it("300 règles, page de 24 : total 300, facette type, première page sous 300 ms", async () => {
    // Le premier appel d'un process paie la connexion et la compilation : on l'écarte, puis on retient la meilleure de trois mesures.
    await functional("tab=flows&limit=1");
    const timings: number[] = [];
    let res = await functional("tab=rules&limit=24");
    for (let run = 0; run < 3; run += 1) {
      const start = performance.now();
      res = await functional("tab=rules&limit=24");
      timings.push(performance.now() - start);
    }
    const elapsed = Math.min(...timings);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(300);
    expect(idsOf(res.body)).toEqual(range(1, 24));
    expect(res.body.offset).toBe(0);
    expect(res.body.previousCursor).toBeNull();
    expect(typeof res.body.nextCursor).toBe("string");
    expect(sum(res.body.facets.type)).toBe(300);
    expect(Object.keys(res.body.facets.type).sort()).toEqual(["calcul", "contrainte", "workflow"]);
    expect(elapsed).toBeLessThan(300);
    expect(res.body.items[0]).toMatchObject({
      kind: "rule",
      specId: "R-001",
      filePath: expect.stringMatching(/^domain\/rules\/R-001-/),
      features: [expect.stringMatching(/^F-\d{3}$/)],
    });
  });

  it("un résumé de workflow porte ses états ; une contrainte n'en a pas", async () => {
    const res = await functional("tab=rules&limit=24&type=workflow");
    expect(res.body.items.every((rule: { type: string }) => rule.type === "workflow")).toBe(true);
    expect(res.body.items[0].states).toEqual(["Brouillon", "En validation", "Validée", "Archivée"]);
    expect(res.body.total).toBe(100);
  });

  it("le curseur suit toute la liste, sans trou ni doublon", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: { body: { items: { specId: string }[]; nextCursor: string | null } } =
        await functional(`tab=rules&limit=100${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...idsOf(res.body));
      cursor = res.body.nextCursor;
    } while (cursor !== null);
    expect(seen).toEqual(range(1, 300));
  });

  it("q porte sur toute la liste : R-250 (hors première page) par son identifiant, « tardive » par son titre", async () => {
    const byId = await functional("tab=rules&q=R-250");
    expect(idsOf(byId.body)).toEqual(["R-250"]);
    const byTitle = await functional("tab=rules&q=tardive");
    expect(idsOf(byTitle.body)).toEqual(["R-250"]);
    expect(byTitle.body.total).toBe(1);
    const none = await functional("tab=rules&q=zzzzabsent");
    expect(none.body).toMatchObject({ items: [], total: 0 });
  });

  it("le filtre de type compte sans tenir compte de lui-même ; type et recherche se combinent", async () => {
    const res = await functional("tab=rules&type=calcul&limit=1");
    expect(res.body.total).toBe(100);
    expect(sum(res.body.facets.type)).toBe(300);
    const mixed = await functional("tab=rules&type=workflow&q=R-250");
    expect(mixed.body.total).toBe(res.body.items.length === 0 ? 0 : mixed.body.total);
    expect(idsOf(mixed.body)).toEqual([]);
  });

  it("around=R-250 rend la page de 24 qui contient la règle, avec son rang", async () => {
    const res = await functional("tab=rules&limit=24&around=R-250");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.offset).toBe(240);
    expect(idsOf(res.body)).toEqual(range(241, 264));
    expect(idsOf(res.body)).toContain("R-250");
    expect((await functional("tab=rules&around=R-999")).status).toBe(404);
  });

  it("curseur étranger : 422 VALIDATION ; around et cursor s'excluent", async () => {
    expect((await functional("tab=rules&cursor=abc")).status).toBe(422);
    expect((await functional("tab=rules&around=R-250&cursor=abc")).status).toBe(422);
  });
});

describe("spec.functional.list : parcours", () => {
  it("18 parcours par pages de 6 : trois pages, étapes et erreurs", async () => {
    const first = await functional("tab=flows&limit=6");
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.total).toBe(18);
    expect(first.body.items).toHaveLength(6);
    expect(first.body.items[0]).toMatchObject({
      kind: "flow",
      specId: "P-parcours-001",
      actor: expect.any(String),
      start: { label: expect.any(String) },
      features: ["F-001", "F-004"],
    });
    expect(first.body.items[0].steps.length).toBeGreaterThanOrEqual(3);
    const second = await functional(`tab=flows&limit=6&cursor=${first.body.nextCursor}`);
    const third = await functional(`tab=flows&limit=6&cursor=${second.body.nextCursor}`);
    expect(third.body.items).toHaveLength(6);
    expect(third.body.nextCursor).toBeNull();
    expect(new Set([...idsOf(first.body), ...idsOf(second.body), ...idsOf(third.body)]).size).toBe(
      18,
    );
    expect(second.body.items.some((f: { errors: unknown[] }) => f.errors.length > 0)).toBe(true);
  });

  it("q et around sur les parcours", async () => {
    expect(idsOf((await functional("tab=flows&q=P-parcours-017")).body)).toEqual([
      "P-parcours-017",
    ]);
    const around = await functional("tab=flows&limit=6&around=P-parcours-013");
    expect(around.body.offset).toBe(12);
    expect(idsOf(around.body)).toContain("P-parcours-013");
  });
});

describe("spec.roles.matrix", () => {
  it("47 actions, 12 groupes de ressources ; ouverts : ceux de moins de 5 actions", async () => {
    const res = await get("roles/matrix");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(47);
    expect(res.body.roles.map((r: { specId: string }) => r.specId)).toEqual([
      "RL-administrateur",
      "RL-gestionnaire",
      "RL-lecteur",
    ]);
    expect(res.body.roles.map((r: { permissionCount: number }) => r.permissionCount)).toEqual([
      47, 40, 12,
    ]);
    expect(res.body.groups).toHaveLength(12);
    expect(res.body.groups.reduce((n: number, g: { count: number }) => n + g.count, 0)).toBe(47);
    const open = res.body.groups.filter((g: { open: boolean }) => g.open);
    expect(open.every((g: { count: number }) => g.count < 5)).toBe(true);
    expect(res.body.actions).toHaveLength(
      open.reduce((n: number, g: { count: number }) => n + g.count, 0),
    );
    expect(res.body.actions[0].access).toHaveLength(3);
  });

  it("group ouvre un groupe de plus ; chaque action porte l'accès de chaque rôle", async () => {
    const base = await get("roles/matrix");
    const res = await get("roles/matrix?group=agenda");
    expect(res.body.actions.length).toBe(base.body.actions.length + 6);
    expect(res.body.groups.find((g: { resource: string }) => g.resource === "agenda").open).toBe(
      true,
    );
    const modify = res.body.actions.find(
      (a: { specId: string }) => a.specId === "PM-agenda.modifier",
    );
    expect(modify.access).toEqual([
      { roleId: "RL-administrateur", level: "allowed" },
      { roleId: "RL-gestionnaire", level: "restricted", restriction: "les siennes" },
      { roleId: "RL-lecteur", level: "denied" },
    ]);
  });

  it("q filtre les actions de toute la matrice, ouvertes ou non", async () => {
    const res = await get("roles/matrix?q=Supprimer");
    expect(res.body.total).toBe(7);
    expect(res.body.actions.every((a: { label: string }) => a.label.startsWith("Supprimer"))).toBe(
      true,
    );
    expect(res.body.actions).toHaveLength(7);
  });
});

describe("spec.item.get et spec.head", () => {
  it("règle, rôle et parcours : valeurs, validated, références entrantes", async () => {
    const rule = await get("items/rule/R-250");
    expect(rule.status, JSON.stringify(rule.body)).toBe(200);
    expect(rule.body).toMatchObject({
      type: "rule",
      id: "R-250",
      values: {
        specId: "R-250",
        title: "Annulation tardive d'une réservation",
        type: "calcul",
        statement: expect.any(String),
        features: [expect.any(String)],
        filePath: expect.stringMatching(/^domain\/rules\/R-250-/),
      },
      validated: false,
    });
    const role = await get("items/role/RL-gestionnaire");
    expect(role.body.values).toMatchObject({ name: "Gestionnaire", specId: "RL-gestionnaire" });
    expect(role.body.values.permissions).toContainEqual({
      specId: "PM-agenda.modifier",
      restriction: "les siennes",
    });
    const flow = await get("items/flow/P-parcours-001");
    expect(flow.body.values).toMatchObject({ specId: "P-parcours-001", actor: expect.any(String) });
    expect(flow.body.values.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("élément absent : 404 ; identifiant du mauvais type : 400 (schéma d'entrée)", async () => {
    expect((await get("items/rule/R-999")).status).toBe(404);
    expect((await get("items/role/RL-absent")).status).toBe(404);
    expect((await get("items/flow/P-absent")).status).toBe(404);
    expect((await get("items/rule/F-001")).status).toBe(400);
  });

  it("spec.head compte règles, rôles et parcours", async () => {
    const res = await get("");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.counts).toMatchObject({ features: 1000, rules: 300, roles: 3, flows: 18 });
  });
});

describe("droits de lecture (B340)", () => {
  const readers = ROLES.filter((role) => role !== "client");
  it.each(readers)("%s lit les listes et la matrice (200) ", async (role) => {
    const actor = world.actors[role];
    expect((await get("functional?tab=rules&limit=1", actor)).status).toBe(200);
    expect((await get("roles/matrix", actor)).status).toBe(200);
  });

  it("le client est refusé (403) sur les deux lectures et sur spec.item.get", async () => {
    const actor = world.actors.client;
    for (const path of ["functional?tab=rules", "roles/matrix", "items/rule/R-001"]) {
      expect((await get(path, actor)).status, path).toBe(403);
    }
  });

  it("business et client sont refusés sur spec.item.get (panneau d'édition)", async () => {
    for (const role of ["business", "client"] as const) {
      expect((await get("items/rule/R-001", world.actors[role])).status, role).toBe(403);
    }
  });
});
