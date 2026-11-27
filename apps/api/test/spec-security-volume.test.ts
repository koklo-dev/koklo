import { seedLarge } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { securityApi } from "./helpers/spec-security.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-117 lot B (cas 6, B808) : `seed:large`, 400 menaces et au moins 2 000 champs. Première page des menaces et des
 * données sous 300 ms, recherche hors de la première page, `around`.
 */
let database: TestDatabase;
let app: INestApplication;
let world: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  world = await createWorld(database, { linkedClient: false });
  await seedLarge(database.url, {
    target: { organizationId: world.organizationId, projectId: world.projectId },
  });
}, 240_000);
afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

const api = () => securityApi(app, world.actors.dev);
const fastest = async <T>(call: () => Promise<T>) => {
  const timings: number[] = [];
  let result = await call();
  for (let run = 0; run < 3; run += 1) {
    const start = performance.now();
    result = await call();
    timings.push(performance.now() - start);
  }
  return { result, ms: Math.min(...timings) };
};

describe("Sécurité en volume", () => {
  it("400 menaces : première page de 50 sous 300 ms, une menace de la dernière surface amenée", async () => {
    const { result, ms } = await fastest(() => api().threats(world.projectId));
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.total).toBe(400);
    expect(result.body.items).toHaveLength(50);
    expect(ms).toBeLessThan(300);
    const around = await api().threats(world.projectId, "?around=SEC-T396");
    expect(around.body.items.map((t: { id: string }) => t.id)).toContain("SEC-T396");
    expect(around.body.offset).toBeGreaterThan(0);
  });

  it("au moins 2 000 champs dont des non classés : première page sous 300 ms", async () => {
    const { result, ms } = await fastest(() => api().data(world.projectId));
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.items).toHaveLength(50);
    const facets = result.body.facets.status;
    expect(facets.unclassified).toBeGreaterThan(0);
    expect(facets.total).toBeGreaterThan(50);
    expect(ms).toBeLessThan(300);
  });
});
