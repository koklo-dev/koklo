import { seedPlanche } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { clientSpaceApi } from "./helpers/client-space.ts";
import { volumeWorld } from "./helpers/long-lists.ts";
import { proposalApi } from "./helpers/proposals.ts";
import { specReadApi } from "./helpers/spec-read.ts";
import { createWorld, send, type World } from "./helpers/tickets.ts";

/**
 * TK-105 lot A (B363 à B368, contrat 3.3.0) : le volume réel côté serveur. `q` (et `type` pour les règles) de
 * `clientSpace.features|rules|flows` filtre tout l'index, pas seulement les éléments chargés ; les totaux sont ceux de la
 * base, jamais la longueur d'une page ; `spec.*` et `proposal.*` restent fermés au client et au business.
 */
const ids = (body: { items: { id: string }[] }) => body.items.map((item) => item.id);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `R-${String(from + i).padStart(3, "0")}`);

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("clientSpace sur seed:large : recherche serveur et première page", () => {
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
  const api = () => clientSpaceApi(app, world.actors.client);

  it("règles : première page de 24 sur 300 sous 300 ms", async () => {
    await api().flows(world.projectId, "?limit=1");
    const timings: number[] = [];
    let res = await api().rules(world.projectId, "?limit=24");
    for (let run = 0; run < 3; run += 1) {
      const start = performance.now();
      res = await api().rules(world.projectId, "?limit=24");
      timings.push(performance.now() - start);
    }
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(300);
    expect(ids(res.body)).toEqual(range(1, 24));
    expect(Math.min(...timings)).toBeLessThan(300);
  });

  it("règles : q trouve R-250 hors de la première page, par identifiant et par titre ; total = total filtré", async () => {
    const byId = await api().rules(world.projectId, "?q=R-250&limit=24");
    expect(ids(byId.body)).toEqual(["R-250"]);
    expect(byId.body.total).toBe(1);
    const byTitle = await api().rules(world.projectId, "?q=tardive&limit=24");
    expect(ids(byTitle.body)).toEqual(["R-250"]);
    const none = await api().rules(world.projectId, "?q=zzzzabsent");
    expect(none.body).toMatchObject({ items: [], total: 0 });
  });

  it("règles : type filtre le total (100 calculs) et se combine avec q", async () => {
    const calcul = await api().rules(world.projectId, "?type=calcul&limit=24");
    expect(calcul.status, JSON.stringify(calcul.body)).toBe(200);
    expect(calcul.body.total).toBe(100);
    expect(calcul.body.items).toHaveLength(24);
    expect(calcul.body.items.every((rule: { type: string }) => rule.type === "calcul")).toBe(true);
    const mixed = await api().rules(world.projectId, "?type=calcul&q=R-250");
    expect(mixed.body.total === 0 || ids(mixed.body)[0] === "R-250").toBe(true);
    expect(mixed.body.items.every((rule: { type: string }) => rule.type === "calcul")).toBe(true);
  });

  it("règles : la page suivante d'une recherche reste dans la recherche", async () => {
    const first = await api().rules(world.projectId, "?type=workflow&limit=24");
    const next = await api().rules(
      world.projectId,
      `?type=workflow&limit=24&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    );
    expect(next.body.offset).toBe(24);
    expect(next.body.total).toBe(100);
    expect(next.body.items.every((rule: { type: string }) => rule.type === "workflow")).toBe(true);
  });

  it("parcours : pages de 6, q porte sur les 18 parcours", async () => {
    const page = await api().flows(world.projectId, "?limit=6");
    expect(page.body.total).toBe(18);
    expect(page.body.items).toHaveLength(6);
    const found = await api().flows(world.projectId, "?q=P-parcours-017");
    expect(ids(found.body)).toEqual(["P-parcours-017"]);
    expect(found.body.total).toBe(1);
    const none = await api().flows(world.projectId, "?q=zzzzabsent");
    expect(none.body).toMatchObject({ items: [], total: 0 });
  });

  it("fonctionnalités : q trouve un élément hors de la première page de 50, total = total filtré", async () => {
    const all = await api().features(world.projectId, "?limit=50");
    expect(all.body.total).toBe(1000);
    expect(all.body.items).toHaveLength(50);
    const found = await api().features(world.projectId, "?q=groupée&limit=50");
    expect(found.status, JSON.stringify(found.body)).toBe(200);
    expect(found.body.total).toBe(1);
    expect(found.body.items[0].title).toBe("Annulation groupée des réservations");
    const none = await api().features(world.projectId, "?q=zzzzabsent");
    expect(none.body).toMatchObject({ items: [], total: 0 });
  });

  it("q vide ou de plus de 200 caractères : refusé", async () => {
    for (const query of ["?q=", `?q=${"x".repeat(201)}`]) {
      const reads = { rules: api().rules, flows: api().flows, features: api().features };
      for (const [name, read] of Object.entries(reads)) {
        // 400 (entrée simple) ou 422 (entrée à contrainte croisée) : jamais 200.
        const status = (await read(world.projectId, query)).status;
        expect([400, 422], `${name} ${query.slice(0, 8)}`).toContain(status);
      }
    }
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("volume réel de la planche : totaux, droits et propositions", () => {
  let database: TestDatabase;
  let app: INestApplication;
  let world: World;
  beforeAll(async () => {
    database = await createSeededDatabase();
    app = await createApp({ databaseUrl: database.url });
    world = await createWorld(database);
    await seedPlanche(database.url, {
      target: { organizationId: world.organizationId, projectId: world.projectId },
    });
  }, 240_000);
  afterAll(async () => {
    await app?.close();
    await database?.dispose();
  });

  it("248 fonctionnalités, 50 chargées : spec.head et clientSpace.progress donnent les vrais totaux", async () => {
    const page = await clientSpaceApi(app, world.actors.client).features(
      world.projectId,
      "?limit=50",
    );
    expect(page.body.items).toHaveLength(50);
    expect(page.body.total).toBe(248);
    const head = await specReadApi(app, world.actors.dev).head(world.projectId);
    expect(head.body.counts).toMatchObject({ features: 248, rules: 86, roles: 3, flows: 18 });
    const progress = await clientSpaceApi(app, world.actors.client).progress(world.projectId);
    expect(progress.body.tabs.features.count).toBe(248);
    expect(progress.body.tabs.rules.count).toBe(86);
    expect(progress.body.tabs.flows.count).toBe(18);
    expect(progress.body.untreated).toBeGreaterThanOrEqual(248);
  });

  it("client : 403 sur spec.functional.list et spec.roles.matrix ; client et business : 403 sur proposal.list et proposal.decideMany", async () => {
    const base = `/projects/${world.projectId}/spec`;
    for (const path of [`${base}/functional?tab=rules`, `${base}/roles/matrix`]) {
      const client = await send(app, world.actors.client.cookie, "get", path);
      expect(client.status, `client ${path}`).toBe(403);
      // Décidée en autonomie (B363) : le business lit le cahier par spec.* (spec-read-access), seules les propositions lui sont fermées.
      const business = await send(app, world.actors.business.cookie, "get", path);
      expect(business.status, `business ${path}`).toBe(200);
    }
    for (const role of ["client", "business"] as const) {
      const api = proposalApi(app, world.actors[role]);
      expect((await api.list(world.projectId)).status, `${role} list`).toBe(403);
      const decide = await api.decideMany(world.projectId, { kind: "feature", zone: "Paiement" });
      expect(decide.status, `${role} decideMany`).toBe(403);
    }
  });

  it("clientSpace.* ne renvoie aucune proposition de l'agent, même avec 355 propositions en base", async () => {
    const api = clientSpaceApi(app, world.actors.client);
    const bodies = await Promise.all([
      api.features(world.projectId, "?limit=100"),
      api.rules(world.projectId, "?limit=100"),
      api.flows(world.projectId, "?limit=100"),
      api.roles(world.projectId),
      api.progress(world.projectId),
    ]);
    for (const res of bodies) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/proposition/i);
    }
    const rows = await database.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM agent_proposals WHERE project_id = $1",
      [world.projectId],
    );
    expect(rows[0]?.n).toBe(355);
  });
});
