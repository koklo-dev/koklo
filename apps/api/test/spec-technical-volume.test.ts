import { seedLarge } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { technicalApi } from "./helpers/spec-technical.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-115 lot B (cas 9, B728, B736) : `seed:large`, 300 choix. La première page de la grille répond sous 300 ms, la
 * recherche trouve un choix de la 5e page et `around` l'amène.
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

const api = () => technicalApi(app, world.actors.dev);
const ids = (body: { items: { specId: string }[] }) => body.items.map((item) => item.specId);

describe("spec.technical.stack.list sur 300 choix", () => {
  it("première page de 24 sous 300 ms, total et compteurs justes", async () => {
    await api().stack(world.projectId, "?limit=1");
    const timings: number[] = [];
    let res = await api().stack(world.projectId);
    for (let run = 0; run < 3; run += 1) {
      const start = performance.now();
      res = await api().stack(world.projectId);
      timings.push(performance.now() - start);
    }
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(300);
    expect(res.body.items).toHaveLength(24);
    expect(res.body.items.every((i: { layer: string }) => i.layer === "applications")).toBe(true);
    expect(Math.min(...timings)).toBeLessThan(300);
    const head = await api().environments(world.projectId);
    expect(head.body.environments).toHaveLength(3);
  });

  it("q trouve un choix de la 5e page ; around l'amène dans sa page", async () => {
    const found = await api().stack(world.projectId, "?q=attestations");
    expect(found.body.total).toBe(1);
    const [id] = ids(found.body);
    const around = await api().stack(world.projectId, `?around=${id}`);
    expect(ids(around.body)).toContain(id);
    expect(Math.floor(around.body.offset / 24) + 1).toBe(5);
  });
});
