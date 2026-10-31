import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  createWebhookApp,
  deliveryJobs,
  deliveryRows,
  installationBody,
  postWebhook,
  pushBody,
  resetIngestion,
  startQueueBoss,
  utf8,
} from "./helpers/webhooks.ts";

/** TK-45c1, CA-1 : une livraison rejouée n'a aucun effet (même X-GitHub-Delivery). */
let database: TestDatabase;
let boss: PgBoss;
let app: INestApplication;

beforeAll(async () => {
  database = await createSeededDatabase();
  boss = await startQueueBoss(database.url);
  app = (await createWebhookApp(database.url)).app;
});

afterAll(async () => {
  await app?.close();
  await boss?.stop();
  await database?.dispose();
});

beforeEach(async () => {
  await resetIngestion(database);
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même route, un test par comportement
describe("rejeu séquentiel", () => {
  it("deux 202 de corps et d'en-têtes de statut identiques, 1 ligne, 1 job", async () => {
    const deliveryId = randomUUID();
    const body = utf8(pushBody());
    const first = await postWebhook(app, { body, deliveryId });
    const second = await postWebhook(app, { body, deliveryId });
    expect([first.status, second.status]).toEqual([202, 202]);
    expect(second.body).toEqual(first.body);
    expect(second.text).toBe(first.text);
    expect(await deliveryRows(database)).toHaveLength(1);
    expect(await deliveryJobs(database)).toHaveLength(1);
  });

  it("le rejeu ne modifie pas la ligne d'origine (statut, tentatives, charge)", async () => {
    const deliveryId = randomUUID();
    await postWebhook(app, { body: utf8(pushBody({ repository: 11 })), deliveryId });
    await database.query(
      "UPDATE webhook_deliveries SET status = 'processed', attempts = 1, processed_at = now()",
    );
    const [before] = await deliveryRows(database);
    await postWebhook(app, { body: utf8(pushBody({ repository: 11 })), deliveryId });
    expect(await deliveryRows(database)).toEqual([before]);
    expect(await deliveryJobs(database)).toHaveLength(1);
  });

  it("même identifiant, charge différente : la première livraison fait foi", async () => {
    const deliveryId = randomUUID();
    await postWebhook(app, { body: utf8(pushBody({ repository: 11 })), deliveryId });
    const replay = await postWebhook(app, { body: utf8(pushBody({ repository: 22 })), deliveryId });
    expect(replay.status).toBe(202);
    const rows = await deliveryRows(database);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.repo_external_id).toBe("11");
    expect(await deliveryJobs(database)).toHaveLength(1);
  });

  it("des identifiants différents donnent des lignes et des jobs distincts, de même clé de file", async () => {
    const body = utf8(pushBody());
    await postWebhook(app, { body, deliveryId: randomUUID() });
    await postWebhook(app, { body, deliveryId: randomUUID() });
    expect(await deliveryRows(database)).toHaveLength(2);
    const jobs = await deliveryJobs(database);
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((job) => job.singleton_key))).toEqual(
      new Set(["push:5678:refs/heads/cadrage"]),
    );
  });

  it("rejeu d'une livraison d'installation : 1 ligne, 1 job", async () => {
    const deliveryId = randomUUID();
    const body = utf8(installationBody("deleted"));
    await postWebhook(app, { body, deliveryId, event: "installation" });
    await postWebhook(app, { body, deliveryId, event: "installation" });
    expect(await deliveryRows(database)).toHaveLength(1);
    expect(await deliveryJobs(database)).toHaveLength(1);
  });

  it("rejeu d'une charge de forme invalide : 202 identique, 1 ligne failed, 0 job", async () => {
    const deliveryId = randomUUID();
    const body = utf8({ ref: "refs/heads/x" });
    const first = await postWebhook(app, { body, deliveryId });
    const second = await postWebhook(app, { body, deliveryId });
    expect([first.status, second.status, second.text]).toEqual([202, 202, first.text]);
    expect(await deliveryRows(database)).toHaveLength(1);
    expect(await deliveryJobs(database)).toEqual([]);
  });
});

describe("concurrence", () => {
  it("20 requêtes simultanées du même identifiant : 20 x 202, exactement 1 ligne et 1 job", async () => {
    const deliveryId = randomUUID();
    const body = utf8(pushBody());
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => postWebhook(app, { body, deliveryId })),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(202));
    expect(new Set(responses.map((response) => response.text))).toEqual(
      new Set(['{"received":true}']),
    );
    expect(await deliveryRows(database)).toHaveLength(1);
    const jobs = await deliveryJobs(database);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe((await deliveryRows(database))[0]?.id);
  });

  it("20 identifiants distincts en parallèle : 20 lignes, 20 jobs", async () => {
    const body = utf8(pushBody());
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => postWebhook(app, { body, deliveryId: randomUUID() })),
    );
    expect(responses.every((response) => response.status === 202)).toBe(true);
    expect(await deliveryRows(database)).toHaveLength(20);
    expect(await deliveryJobs(database)).toHaveLength(20);
  });
});
