import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  createWebhookApp,
  expectNothingWritten,
  MAX_BODY,
  postWebhook,
  pushBody,
  rawRequest,
  resetIngestion,
  sign,
  startQueueBoss,
  utf8,
  type WebhookApp,
} from "./helpers/webhooks.ts";

const verify = vi.hoisted(() => vi.fn());
vi.mock("@koklo/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@koklo/github")>();
  verify.mockImplementation(actual.verifyWebhookSignature);
  return { ...actual, verifyWebhookSignature: verify };
});

/**
 * TK-45c1 : `GITHUB_WEBHOOK_SECRET` absent ou vide -> l'API démarre, un avertissement unique est
 * journalisé (jamais la valeur), la route répond 503 `webhook_not_configured` AVANT toute lecture
 * du corps, sans écrire et sans calculer de HMAC (une clé vide est falsifiable par n'importe qui).
 */
let database: TestDatabase;
let boss: PgBoss;
const started: WebhookApp[] = [];

beforeAll(async () => {
  database = await createSeededDatabase();
  boss = await startQueueBoss(database.url);
});

afterAll(async () => {
  await Promise.all(started.map(({ app }) => app.close()));
  await boss?.stop();
  await database?.dispose();
});

beforeEach(async () => {
  verify.mockClear();
  await resetIngestion(database);
});

async function startWith(secret: string | null): Promise<WebhookApp> {
  const webhookApp = await createWebhookApp(database.url, { secret });
  started.push(webhookApp);
  return webhookApp;
}

describe.each([
  ["variable absente", null],
  ["variable vide", ""],
])("secret : %s", (_label, secret) => {
  let app: INestApplication;
  let lines: string[];

  beforeAll(async () => {
    ({ app, lines } = await startWith(secret));
  });

  it("503 { error: 'webhook_not_configured' }, rien d'écrit, aucun HMAC calculé", async () => {
    const response = await postWebhook(app, { body: utf8(pushBody()) });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "webhook_not_configured" });
    expect(verify).not.toHaveBeenCalled();
    await expectNothingWritten(database);
  });

  it("une signature « valide » calculée avec une clé vide est refusée aussi (503)", async () => {
    const body = utf8(pushBody());
    const response = await postWebhook(app, { body, signature: sign(body, "") });
    expect(response.status).toBe(503);
    await expectNothingWritten(database);
  });

  it("le 503 passe avant le 413 et le 415 (le corps n'est pas lu)", async () => {
    const oversize = await rawRequest(app, {
      headers: { "content-type": "text/plain", "content-length": String(MAX_BODY + 1) },
    });
    expect(oversize.status).toBe(503);
    const wrongType = await postWebhook(app, { body: utf8("x"), contentType: "text/plain" });
    expect(wrongType.status).toBe(503);
    expect(verify).not.toHaveBeenCalled();
  });

  it("l'API a démarré et sert le reste de la plateforme", async () => {
    const { default: request } = await import("supertest");
    expect((await request(app.getHttpServer()).get("/health")).status).toBeLessThan(500);
  });

  it("un seul avertissement au démarrage, qui nomme la variable et jamais une valeur", () => {
    const warnings = lines
      .map((line) => JSON.parse(line) as { level?: number; msg?: string })
      .filter(
        (entry) => entry.level === 40 && JSON.stringify(entry).includes("GITHUB_WEBHOOK_SECRET"),
      );
    expect(warnings).toHaveLength(1);
  });
});

describe("secret configuré", () => {
  it("aucun avertissement de démarrage, et la vérification reçoit les octets bruts exacts", async () => {
    const { app, lines } = await startWith("un-secret-de-test-assez-long-0123456789");
    expect(lines.join("")).not.toContain("GITHUB_WEBHOOK_SECRET");
    const body = Buffer.from(`{ "ref" :  "refs/heads/x" }\n`, "utf8");
    await postWebhook(app, { body, secret: "un-secret-de-test-assez-long-0123456789" });
    expect(verify).toHaveBeenCalledTimes(1);
    const input = verify.mock.calls[0]?.[0] as {
      secret: string;
      rawBody: Uint8Array;
      header: string;
    };
    expect(input.secret).toBe("un-secret-de-test-assez-long-0123456789");
    expect(Buffer.from(input.rawBody).equals(body)).toBe(true);
    expect(input.header).toBe(sign(body, "un-secret-de-test-assez-long-0123456789"));
  });
});
