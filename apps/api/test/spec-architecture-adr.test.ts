import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { volumeWorld } from "./helpers/long-lists.ts";
import { send, type World } from "./helpers/tickets.ts";

/**
 * TK-113 lot A (cas 1, 2, 3, 11 ; B575 à B592) : `spec.architecture.adr.list` (pages de 50, `q`, `status`, `component`,
 * `from` et `to`, facettes, `around`) et `spec.architecture.adr.byId` sur `seed:large` (300 décisions : une sur dix proposée,
 * la quatrième de chaque vingt remplacée par la suivante ; date = 1er janvier 2026 + rang), `spec.item.get` de type `adr`,
 * droits : client et business 403 sur les deux lectures.
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
const adrs = (query = "", actor = world.actors.dev) =>
  get(`architecture/adr${query === "" ? "" : `?${query}`}`, actor);
const idsOf = (body: { items: { specId: string }[] }) => body.items.map((item) => item.specId);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `ADR-${String(from + i).padStart(3, "0")}`);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("spec.architecture.adr.list", () => {
  it("300 décisions, pages de 50 : total 300, offsets, curseur vers la suite", async () => {
    const first = await adrs();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.total).toBe(300);
    expect(idsOf(first.body)).toEqual(range(1, 50));
    expect(first.body.previousCursor).toBeNull();
    const second = await adrs(`cursor=${first.body.nextCursor}`);
    expect(idsOf(second.body)).toEqual(range(51, 100));
    expect(second.body.offset).toBe(50);
  });

  it("une ligne : titre, statut, date, liens, remplaçante, fichier ; jamais de contenu de section", async () => {
    const res = await adrs("limit=10");
    const row = res.body.items.find((i: { specId: string }) => i.specId === "ADR-004");
    expect(row).toEqual({
      specId: "ADR-004",
      title: "Décision d'architecture 004",
      status: "remplacee",
      date: "2026-01-05",
      links: ["C-composant-005", "F-005"],
      supersededBy: "ADR-005",
      filePath: "architecture/adr/ADR-004-decision-004.md",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Contexte de la décision/);
  });

  it("recherche sur une décision non chargée (page 5) ; jokers et syntaxe SQL : rien, jamais d'erreur", async () => {
    const byTitle = await adrs(`q=${encodeURIComponent("architecture 250")}`);
    expect(idsOf(byTitle.body)).toContain("ADR-250");
    for (const q of ["999%", "a_b", "'; DROP TABLE spec_entities; --", "&|!"]) {
      const res = await adrs(`q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(res.body.total, q).toBe(0);
    }
  });

  it("statut : filtre sur toute la tête, facettes par statut sans tenir compte du filtre", async () => {
    const proposed = await adrs("status=proposee&limit=50");
    expect(proposed.body.total).toBe(30);
    expect(proposed.body.items.every((i: { status: string }) => i.status === "proposee")).toBe(
      true,
    );
    expect(proposed.body.facets.status).toEqual({ acceptee: 255, proposee: 30, remplacee: 15 });
    const all = await adrs();
    expect(all.body.facets.status).toEqual({ acceptee: 255, proposee: 30, remplacee: 15 });
  });

  it("composant : décisions qui citent le composant dans leurs liens", async () => {
    const res = await adrs("component=C-composant-005");
    expect(idsOf(res.body)).toEqual(["ADR-004", "ADR-124", "ADR-244"]);
    expect((await adrs("component=C-inconnu")).body.total).toBe(0);
  });

  it("période : from et to inclus, sur la date de la décision", async () => {
    const res = await adrs("from=2026-01-11&to=2026-01-20");
    expect(idsOf(res.body)).toEqual(range(10, 19));
    expect((await adrs("from=2026-01-11")).body.total).toBe(291);
    expect((await adrs("to=2026-01-11")).body.total).toBe(10);
  });

  it("around amène une décision hors première page ; inconnue : 404", async () => {
    const around = await adrs("around=ADR-220");
    expect(idsOf(around.body)).toContain("ADR-220");
    expect(around.body.offset).toBe(200);
    expect((await adrs("around=ADR-999")).status).toBe(404);
  });

  it("entrées refusées : around avec curseur, révision double, statut, date et identifiant mal formés", async () => {
    for (const query of [
      "around=ADR-070&cursor=x",
      `branch=a&commitSha=${"a".repeat(40)}`,
      "status=refusee",
      "from=hier",
      "around=adr-70",
      "component=composant",
    ]) {
      expect((await adrs(query)).status, query).toBe(400);
    }
  });
});

describe("spec.architecture.adr.byId et spec.item.get", () => {
  it("fiche complète : sections, conséquences, alternatives, liens, remplaçante et sa date, En clair, fichier, SHA", async () => {
    const res = await get("architecture/adr/ADR-004");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      specId: "ADR-004",
      title: "Décision d'architecture 004",
      status: "remplacee",
      date: "2026-01-05",
      deciders: ["Équipe technique"],
      context: expect.stringContaining("Contexte de la décision 004"),
      decision: "Décision retenue 004.",
      consequences: {
        positive: ["Le comportement est plus simple à comprendre."],
        toAccept: ["Un surcoût de maintenance à surveiller."],
      },
      alternatives: [{ name: "Autre option", reason: "Moins adaptée au besoin." }],
      links: ["C-composant-005", "F-005"],
      supersededBy: "ADR-005",
      supersededOn: "2026-01-06",
      plain: expect.stringContaining("En clair"),
      filePath: "architecture/adr/ADR-004-decision-004.md",
      commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
  });

  it("une décision non remplacée n'a ni remplaçante ni date de remplacement", async () => {
    const res = await get("architecture/adr/ADR-001");
    expect(res.body.supersededBy).toBeUndefined();
    expect(res.body.supersededOn).toBeUndefined();
  });

  it("inconnue : 404 ; identifiant mal formé : 400", async () => {
    expect((await get("architecture/adr/ADR-999")).status).toBe(404);
    expect((await get("architecture/adr/C-api")).status).toBe(400);
  });

  it("spec.item.get de type adr : mêmes valeurs, livrable Architecture, éléments qui la citent", async () => {
    const res = await get("items/adr/ADR-005");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      type: "adr",
      id: "ADR-005",
      validated: false,
      values: { specId: "ADR-005", status: "acceptee" },
    });
    expect((await get("items/adr/ADR-999")).status).toBe(404);
    expect((await get("items/adr/F-001")).status).toBe(400);
  });
});

describe("droits", () => {
  it.each(["owner", "admin", "dev", "designer"] as const)(
    "%s lit la liste et la fiche",
    async (role) => {
      const actor = world.actors[role];
      expect((await adrs("", actor)).status, role).toBe(200);
      expect((await get("architecture/adr/ADR-001", actor)).status, role).toBe(200);
    },
  );

  it.each(["client", "business"] as const)(
    "%s reçoit 403 sur la liste et la fiche, sans rien de la décision divulgué",
    async (role) => {
      const actor = world.actors[role];
      for (const path of ["architecture/adr", "architecture/adr/ADR-001", "items/adr/ADR-001"]) {
        const res = await get(path, actor);
        expect(res.status, `${role} ${path}`).toBe(403);
        expect(JSON.stringify(res.body), path).not.toMatch(/Décision d'architecture|filePath/);
      }
    },
  );

  it("sans session : 401", async () => {
    const res = await send(
      app,
      undefined,
      "get",
      `/projects/${world.projectId}/spec/architecture/adr`,
    );
    expect(res.status).toBe(401);
  });
});

describe("filtre de composant : décisions citées par le composant", () => {
  it("les `decisions` du composant s'ajoutent aux liens des décisions", async () => {
    await database.query(
      `UPDATE spec_entities SET data = jsonb_set(data, '{decisions}', '["ADR-010"]')
        WHERE kind = 'component' AND spec_id = 'C-composant-006'`,
    );
    const res = await adrs("component=C-composant-006");
    expect(idsOf(res.body)).toEqual(["ADR-005", "ADR-010", "ADR-125", "ADR-245"]);
  });
});
