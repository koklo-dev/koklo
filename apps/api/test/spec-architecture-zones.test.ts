import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { volumeWorld } from "./helpers/long-lists.ts";
import { installBench } from "./helpers/repo-scene.ts";
import { commitAtHead } from "./helpers/spec-architecture.ts";
import { entity, readScene, seedIndex } from "./helpers/spec-read.ts";
import { send, type World } from "./helpers/tickets.ts";

/**
 * TK-112 lot A (cas 1 et 2, B546) : `spec.architecture.zones`, `zone` et `search` sur `seed:large` (120 composants en huit
 * zones, 300 flux), puis une zone de plus de 200 composants (`truncated`) et l'icône de `architecture/_zones.yaml`.
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
  send(app, actor.cookie, "get", `/projects/${world.projectId}/spec/architecture/${path}`);
const ZONE_IDS = [
  "interfaces",
  "noyau-metier",
  "donnees",
  "integrations",
  "messagerie",
  "securite",
  "exploitation",
  "outils",
];

describe("spec.architecture.zones sur seed:large", () => {
  it("huit zones de 15 composants, aperçu de 7 au plus, total 120, commit de la tête", async () => {
    const res = await get("zones");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.componentCount).toBe(120);
    expect(res.body.commitSha).toMatch(/^[0-9a-f]{40}$/);
    const zones = res.body.zones as {
      id: string;
      name: string;
      icon: string;
      componentCount: number;
      actorCount: number;
      preview: string[];
      links: { to: string; count: number }[];
    }[];
    expect(zones.map((z) => z.id).sort()).toEqual([...ZONE_IDS].sort());
    for (const zone of zones) {
      expect(zone.componentCount, zone.id).toBe(15);
      expect(zone.preview).toHaveLength(7);
      expect(zone.icon).toBe("folder_open");
    }
    expect(zones.find((z) => z.id === "noyau-metier")?.name).toBe("Noyau métier");
  });

  it("liens : chaque composant dépend du précédent, d'une autre zone : 119 paires comptées sur les deux zones", async () => {
    const res = await get("zones");
    const zones = res.body.zones as { links: { to: string; count: number }[] }[];
    const total = zones.reduce((n, z) => n + z.links.reduce((m, l) => m + l.count, 0), 0);
    expect(total).toBe(2 * 119);
    expect(zones.every((z) => z.links.length === 2)).toBe(true);
  });

  it("acteurs : les trois rôles des flux, comptés par zone", async () => {
    const res = await get("zones");
    const counts = (res.body.zones as { actorCount: number }[]).map((z) => z.actorCount);
    expect(counts.every((n) => n >= 1 && n <= 3)).toBe(true);
  });

  it.each(["owner", "admin", "dev", "designer"] as const)("%s lit les zones", async (role) => {
    expect((await get("zones", world.actors[role])).status).toBe(200);
  });

  it.each(["client", "business"] as const)("%s : 403 sans rien divulguer", async (role) => {
    for (const path of ["zones", "zone?zone=interfaces", "search?q=composant"]) {
      const res = await get(path, world.actors[role]);
      expect(res.status, `${role} ${path}`).toBe(403);
      expect(JSON.stringify(res.body)).not.toMatch(/Composant|Interfaces/);
    }
  });

  it("révision double : 400", async () => {
    expect((await get(`zones?branch=a&commitSha=${"a".repeat(40)}`)).status).toBe(400);
  });
});

describe("spec.architecture.zone sur seed:large", () => {
  it("une zone ouverte : 15 composants nommés et typés, liens sortants, acteurs nommés", async () => {
    const res = await get("zone?zone=noyau-metier");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.zone).toEqual({
      id: "noyau-metier",
      name: "Noyau métier",
      icon: "folder_open",
      componentCount: 15,
    });
    expect(res.body.components).toHaveLength(15);
    expect(res.body.components[0]).toEqual({
      specId: expect.stringMatching(/^C-composant-\d{3}$/),
      name: expect.stringMatching(/^Composant \d{3}$/),
      type: expect.stringMatching(/^(app|service|store|queue|ext)$/),
      responsibility: expect.stringMatching(/^Responsabilité du composant \d{3}\.$/),
    });
    expect(res.body.truncated).toBe(false);
    expect(res.body.outgoing).toHaveLength(2);
    expect(res.body.actors.length).toBeGreaterThan(0);
    expect(
      res.body.actors
        .map((a: { name: string }) => a.name)
        .every((n: string) => !n.startsWith("RL-")),
    ).toBe(true);
  });

  it("zone inconnue : 404 ; sans zone : 400", async () => {
    expect((await get("zone?zone=inconnue")).status).toBe(404);
    expect((await get("zone")).status).toBe(400);
  });
});

describe("spec.architecture.search sur seed:large", () => {
  it("trouve un composant hors de la première page de 50, 20 résultats au plus", async () => {
    const res = await get("search?q=Composant%20110");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((i: { specId: string }) => i.specId)).toContain("C-composant-110");
    expect(res.body.items.length).toBeLessThanOrEqual(20);
    const item = res.body.items.find((i: { specId: string }) => i.specId === "C-composant-110");
    expect(item).toEqual({
      specId: "C-composant-110",
      name: "Composant 110",
      type: expect.any(String),
      zone: expect.any(String),
    });
    expect((await get("search?q=composant")).body.items).toHaveLength(20);
  });

  it("saisie à jokers ou à syntaxe SQL : rien, jamais d'erreur ; q vide : 400", async () => {
    for (const q of ["999%", "a_b", "'; DROP TABLE spec_entities; --", "&|!"]) {
      const res = await get(`search?q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(res.body.items, q).toEqual([]);
    }
    expect((await get("search?q=")).status).toBe(400);
  });
});

const read = installBench({ beforeAll, afterAll, beforeEach });

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un même petit dépôt, un test par comportement
describe("zones : cas limites d'un petit dépôt", () => {
  const component = (id: string, zone: string, over: Record<string, unknown> = {}) =>
    entity("component", id, id, {
      id,
      titre: id,
      nom: id.slice(2),
      type: "service",
      zone,
      responsabilite: "R",
      ...over,
    });

  it("plus de 200 composants dans une zone : 200 rendus, truncated, compte réel", async () => {
    const s = await readScene(read());
    await seedIndex(read(), s, [], {
      commit: true,
      entities: Array.from({ length: 205 }, (_, i) =>
        component(`C-c${String(i).padStart(3, "0")}`, "Gros"),
      ),
    });
    const res = await send(
      read().app,
      s.world.actors.dev.cookie,
      "get",
      `/projects/${s.projectId}/spec/architecture/zone?zone=gros`,
    );
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.components).toHaveLength(200);
    expect(res.body.zone.componentCount).toBe(205);
    expect(res.body.truncated).toBe(true);
  });

  it("icône et libellé de architecture/_zones.yaml au commit indexé ; sans zone : « Sans zone »", async () => {
    const s = await readScene(read());
    const { snapshotId } = await seedIndex(read(), s, [], {
      commit: true,
      entities: [component("C-a", "Données"), component("C-b", "")],
    });
    await commitAtHead(read(), s, snapshotId, [
      {
        path: "architecture/_zones.yaml",
        content: "zones:\n  - nom: Données\n    icone: database\n",
      },
    ]);
    const res = await send(
      read().app,
      s.world.actors.designer.cookie,
      "get",
      `/projects/${s.projectId}/spec/architecture/zones`,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.zones.map((z: { id: string; icon: string }) => [z.id, z.icon])).toEqual([
      ["donnees", "database"],
      ["sans-zone", "folder_open"],
    ]);
  });

  it("rien d'indexé : 404 ; hors du projet : 404", async () => {
    const s = await readScene(read());
    const none = await send(
      read().app,
      s.world.actors.dev.cookie,
      "get",
      `/projects/${s.projectId}/spec/architecture/zones`,
    );
    expect(none.status).toBe(404);
    const other = await send(
      read().app,
      s.world.actors.dev.cookie,
      "get",
      "/projects/123e4567-e89b-42d3-a456-426614174000/spec/architecture/zones",
    );
    expect(other.status).toBe(404);
  });
});
