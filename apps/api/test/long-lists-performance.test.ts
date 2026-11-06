import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createSeededDatabase } from "./helpers/app.ts";
import { volumeWorld } from "./helpers/long-lists.ts";
import { specReadApi } from "./helpers/spec-read.ts";
import { apiFor, type World } from "./helpers/tickets.ts";

/**
 * TK-94 (T12, passation 07 §6) : « première page < 300 ms côté serveur » sur le jeu `seed:large`.
 * Mesure : médiane de 15 appels HTTP après 3 appels de chauffe, première page de 50 éléments, avec
 * et sans recherche. La base est celle d'un conteneur éphémère sur une machine partagée : le seuil
 * est celui de la passation, la médiane écarte les pointes.
 */
let database: TestDatabase;
let app: INestApplication;
let world: World;

const BUDGET_MS = 300;
const RUNS = 15;
const WARMUP = 3;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
  world = await volumeWorld(database);
  await database.query("ANALYZE");
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

async function median(call: () => Promise<{ status: number }>): Promise<number> {
  for (let i = 0; i < WARMUP; i++) expect((await call()).status).toBe(200);
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const res = await call();
    times.push(performance.now() - start);
    expect(res.status).toBe(200);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(RUNS / 2)] as number;
}

const features = (query: string) => () =>
  specReadApi(app, world.actors.dev).list(world.projectId, query);
const tickets = (query: string) => () => apiFor(app, world.actors.dev).listTickets(query);

describe("première page < 300 ms côté serveur sur seed:large", () => {
  it.each([
    ["spec.listFeatures, 50 premières", features("?limit=50")],
    ["spec.listFeatures, recherche « annulation »", features("?limit=50&q=annulation")],
    ["spec.listFeatures, lien direct F-187", features("?limit=50&around=F-187")],
    ["ticket.list, 50 premiers", tickets("?limit=50")],
    ["ticket.list, colonne todo (30)", tickets("?limit=30&status=todo")],
    ["ticket.list, recherche « annulation »", tickets("?limit=50&q=annulation")],
  ])("%s : médiane < 300 ms", async (name, call) => {
    const value = await median(call);
    // KOKLO_PERF_REPORT=<fichier> : consigne les médianes pour le compte rendu du ticket.
    if (process.env.KOKLO_PERF_REPORT) {
      appendFileSync(process.env.KOKLO_PERF_REPORT, `${name} : ${value.toFixed(1)} ms\n`);
    }
    expect(value, `médiane ${value.toFixed(1)} ms`).toBeLessThan(BUDGET_MS);
  });
});
