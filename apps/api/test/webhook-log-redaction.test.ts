import { randomUUID } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializeRequest } from "../src/request-serializer.ts";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  createWebhookApp,
  MARKERS,
  OTHER_SECRET,
  postWebhook,
  pushBody,
  sign,
  startQueueBoss,
  utf8,
  WEBHOOK_SECRET,
} from "./helpers/webhooks.ts";

/**
 * TK-45c1 : aucune fuite dans les journaux. L'en-tête de signature est masqué par le sérialiseur de
 * requêtes ; ni le secret, ni le corps, ni les auteurs, ni la signature n'atteignent un journal,
 * que la livraison soit acceptée ou rejetée.
 */
describe("serializeRequest : masquage de x-hub-signature-256", () => {
  const signature = `sha256=${"ab".repeat(32)}`;

  it("la valeur n'apparaît nulle part dans la requête sérialisée", () => {
    const serialized = serializeRequest({
      id: "req-1",
      method: "POST",
      url: "/api/webhooks/github",
      headers: { "x-hub-signature-256": signature, "x-github-event": "push", host: "x" },
    });
    expect(JSON.stringify(serialized)).not.toContain(signature);
    expect(JSON.stringify(serialized)).not.toContain("ab".repeat(32));
  });

  it("le masquage ne dépend pas de la casse du nom d'en-tête et épargne les autres en-têtes", () => {
    const serialized = serializeRequest({
      headers: {
        "X-Hub-Signature-256": signature,
        "x-github-delivery": "d-1",
        "x-github-event": "push",
      },
    }) as { headers: Record<string, unknown> };
    expect(JSON.stringify(serialized)).not.toContain(signature);
    expect(serialized.headers["x-github-delivery"]).toBe("d-1");
    expect(serialized.headers["x-github-event"]).toBe("push");
  });
});

describe("journaux de l'API pendant des livraisons", () => {
  let database: TestDatabase;
  let boss: PgBoss;
  let app: INestApplication;
  let lines: string[];

  beforeAll(async () => {
    database = await createSeededDatabase();
    boss = await startQueueBoss(database.url);
    ({ app, lines } = await createWebhookApp(database.url, { logLevel: "debug" }));
  });

  afterAll(async () => {
    await app?.close();
    await boss?.stop();
    await database?.dispose();
  });

  it("livraison acceptée, rejouée, rejetée (401, 400) : aucun secret, signature, corps ni auteur journalisés", async () => {
    const body = utf8(pushBody());
    const deliveryId = randomUUID();
    const signatureSent = sign(body);
    await postWebhook(app, { body, deliveryId });
    await postWebhook(app, { body, deliveryId });
    const forged = await postWebhook(app, { body, secret: OTHER_SECRET });
    await postWebhook(app, { body: Buffer.from("{ pas du json"), event: "push" });
    expect(forged.status).toBe(401);
    expect(forged.text).not.toContain(WEBHOOK_SECRET);

    const logged = lines.join("\n");
    expect(logged.length).toBeGreaterThan(0);
    const forbidden = [
      WEBHOOK_SECRET,
      OTHER_SECRET,
      signatureSent,
      signatureSent.slice(7),
      sign(body, OTHER_SECRET),
      ...Object.values(MARKERS),
      body.toString("utf8"),
    ];
    for (const value of forbidden) expect(logged).not.toContain(value);
  });
});
