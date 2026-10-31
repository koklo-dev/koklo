import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  createWebhookApp,
  deliveryJobs,
  deliveryRows,
  MARKERS,
  postWebhook,
  pushBody,
  resetIngestion,
  sign,
  startQueueBoss,
  utf8,
  WEBHOOK_SECRET,
} from "./helpers/webhooks.ts";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureException: vi.fn() }));

/**
 * TK-45c1 : l'enfilage échoue (la file n'existe pas : pg-boss refuse l'envoi) -> la ligne qui vient
 * d'être insérée est supprimée et la réponse est 503 ; un rejeu ensuite réussit comme une première
 * livraison. Ni le secret ni la charge ne fuient dans les journaux ni dans le SDK d'erreurs.
 */
let database: TestDatabase;
let boss: PgBoss;
let app: INestApplication;
let lines: string[];

beforeAll(async () => {
  database = await createSeededDatabase();
  boss = await startQueueBoss(database.url, false);
  ({ app, lines } = await createWebhookApp(database.url));
});

afterAll(async () => {
  await app?.close();
  await boss?.stop();
  await database?.dispose();
});

beforeEach(async () => {
  vi.clearAllMocks();
  lines.length = 0;
  await resetIngestion(database);
});

describe("échec d'enfilage", () => {
  it("503, ligne supprimée (compensation), aucun job ; le rejeu réussit ensuite comme une première livraison", async () => {
    const deliveryId = randomUUID();
    const body = utf8(pushBody());
    const failed = await postWebhook(app, { body, deliveryId });
    expect(failed.status).toBe(503);
    expect(await deliveryRows(database)).toEqual([]);
    expect(await deliveryJobs(database)).toEqual([]);

    await boss.createQueue("webhook-delivery", { policy: "key_strict_fifo" });
    const replay = await postWebhook(app, { body, deliveryId });
    expect(replay.status).toBe(202);
    expect(replay.body).toEqual({ received: true });
    expect(await deliveryRows(database)).toHaveLength(1);
    expect(await deliveryJobs(database)).toHaveLength(1);
    await boss.deleteQueue("webhook-delivery");
  });

  it("l'échec est journalisé et signalé au SDK sans secret, sans charge, sans signature", async () => {
    const body = utf8(pushBody());
    const signature = sign(body);
    expect((await postWebhook(app, { body })).status).toBe(503);
    const sent = JSON.stringify([lines, vi.mocked(Sentry.captureException).mock.calls]);
    expect(sent).toContain("webhook-delivery");
    for (const secret of [WEBHOOK_SECRET, signature, ...Object.values(MARKERS)]) {
      expect(sent).not.toContain(secret);
    }
  });
});
