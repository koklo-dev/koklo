import type { TestDatabase } from "@koklo/db/testing";
import { webhookDeliverySingletonKey } from "@koklo/domain";
import { normalizeWebhook } from "@koklo/github";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  createWebhookApp,
  deliveryJobs,
  deliveryRows,
  installationBody,
  MARKERS,
  postWebhook,
  pushBody,
  resetIngestion,
  sign,
  startQueueBoss,
  utf8,
} from "./helpers/webhooks.ts";

/** TK-45c1 : une livraison valide est stockée normalisée, puis enfilée (id du job = id de la ligne). */
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
describe("push signé", () => {
  it("202 { received: true }, une ligne received normalisée, un job { deliveryId }", async () => {
    const deliveryId = "6f1c0a52-3b7e-4d6a-9a1e-0c2f4b8d7e11";
    const raw = pushBody({ installation: 1234, repository: 5678, ref: "refs/heads/cadrage" });
    const response = await postWebhook(app, { body: utf8(raw), deliveryId });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ received: true });

    const expected = normalizeWebhook("push", deliveryId, raw);
    const [row, ...others] = await deliveryRows(database);
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      provider: "github",
      delivery_id: deliveryId,
      event: "push",
      installation_external_id: "1234",
      repo_external_id: "5678",
      status: "received",
      attempts: 0,
      error_code: null,
    });
    expect(row?.payload).toEqual(JSON.parse(JSON.stringify(expected)));

    const jobs = await deliveryJobs(database);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: row?.id,
      name: "webhook-delivery",
      singleton_key: webhookDeliverySingletonKey(
        expected as Parameters<typeof webhookDeliverySingletonKey>[0],
      ),
      data: { deliveryId: row?.id },
    });
    expect(jobs[0]?.singleton_key).toBe("push:5678:refs/heads/cadrage");
  });

  it("la charge stockée et le job ne contiennent ni auteur, ni e-mail, ni message de commit", async () => {
    expect((await postWebhook(app, { body: utf8(pushBody()) })).status).toBe(202);
    expect(await deliveryRows(database)).toHaveLength(1);
    expect(await deliveryJobs(database)).toHaveLength(1);
    const stored = JSON.stringify([await deliveryRows(database), await deliveryJobs(database)]);
    for (const marker of Object.values(MARKERS)) expect(stored).not.toContain(marker);
  });

  it("aucune session ni cookie requis ; un cookie invalide n'y change rien", async () => {
    const response = await postWebhook(app, { body: utf8(pushBody()) }).set(
      "Cookie",
      "better-auth.session_token=invalide",
    );
    expect(response.status).toBe(202);
  });

  it("aucune entrée d'audit n'est écrite (pas d'organisation à ce stade)", async () => {
    const before = await database.query<{ n: string }>("SELECT count(*)::text AS n FROM audit_log");
    expect((await postWebhook(app, { body: utf8(pushBody()) })).status).toBe(202);
    const after = await database.query<{ n: string }>("SELECT count(*)::text AS n FROM audit_log");
    expect(after).toEqual(before);
  });
});

describe("octets bruts : la signature porte sur le corps reçu, jamais sur une re-sérialisation", () => {
  const irregular = Buffer.from(
    `{\n  "ref":   "refs/heads/cadrage",\r\n  "after": "${"0".repeat(39)}2", "before":"${"0".repeat(39)}1",\n` +
      `"created":false,"deleted":false,"forced":false,\n  "installation": {"id": 1234},\n` +
      `"repository": {"id": 5678, "description": "résumé — 日本語 \\u00e9"},\n  "z": 1, "a": 2\n}\n`,
    "utf8",
  );

  it("JSON irrégulier (espaces, retours, clés non triées, non ASCII) signé sur ses octets : accepté", async () => {
    const response = await postWebhook(app, { body: irregular });
    expect(response.status).toBe(202);
    expect(await deliveryRows(database)).toHaveLength(1);
  });

  it("le même objet re-sérialisé autrement avec la signature d'origine : 401", async () => {
    const resigned = utf8(JSON.parse(irregular.toString("utf8")));
    const response = await postWebhook(app, { body: resigned, signature: sign(irregular) });
    expect(response.status).toBe(401);
    expect(await deliveryRows(database)).toEqual([]);
  });
});

describe("installation signé", () => {
  it("ligne received avec l'action, job de clé installation:<id>", async () => {
    const response = await postWebhook(app, {
      body: utf8(installationBody("suspend")),
      event: "installation",
    });
    expect(response.status).toBe(202);
    const [row] = await deliveryRows(database);
    expect(row).toMatchObject({
      event: "installation",
      action: "suspend",
      installation_external_id: "1234",
      status: "received",
    });
    const [job] = await deliveryJobs(database);
    expect(job).toMatchObject({
      id: row?.id,
      singleton_key: "installation:1234",
      data: { deliveryId: row?.id },
    });
  });
});

describe("autres événements : stockés `ignored`, jamais enfilés, enveloppe seule", () => {
  it.each([
    "pull_request",
    "pull_request_review",
    "check_suite",
    "check_run",
    "workflow_run",
    "deployment_status",
  ])("%s", async (event) => {
    const raw = {
      action: "completed",
      installation: { id: 1234 },
      repository: { id: 5678 },
      sender: { login: MARKERS.pusher, email: MARKERS.email },
      pull_request: { title: MARKERS.message, user: { login: MARKERS.author } },
    };
    const response = await postWebhook(app, { body: utf8(raw), event });
    expect(response.status).toBe(202);
    const [row, ...others] = await deliveryRows(database);
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      event,
      action: "completed",
      status: "ignored",
      installation_external_id: "1234",
      repo_external_id: "5678",
    });
    expect(await deliveryJobs(database)).toEqual([]);
    const stored = JSON.stringify(row?.payload);
    for (const marker of Object.values(MARKERS)) expect(stored).not.toContain(marker);
  });
});

describe("charge de forme invalide : trace conservée, pas de job", () => {
  it("push sans repository.id : 202, ligne failed / invalid_payload, charge {}", async () => {
    const { repository: _omitted, ...withoutRepository } = pushBody();
    const response = await postWebhook(app, { body: utf8(withoutRepository) });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ received: true });
    const [row, ...others] = await deliveryRows(database);
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      event: "push",
      status: "failed",
      error_code: "invalid_payload",
      payload: {},
    });
    expect(await deliveryJobs(database)).toEqual([]);
  });
});

describe("hors contrat et non-régression des parseurs", () => {
  it("la route n'apparaît pas dans openapi.json", async () => {
    const response = await request(app.getHttpServer()).get("/openapi.json");
    expect(Object.keys(response.body.paths).some((path) => path.includes("webhook"))).toBe(false);
  });

  it("GET sur la route : pas de traitement (404 ou 405)", async () => {
    const response = await request(app.getHttpServer()).get("/api/webhooks/github");
    expect([404, 405]).toContain(response.status);
    expect(await deliveryRows(database)).toEqual([]);
  });

  it("garde : un corps JSON > 100 ko sur une autre route reste refusé (la limite n'est pas relevée globalement)", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/sign-in/magic-link")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "a@b.c", padding: "x".repeat(300_000) }));
    expect(response.status).toBe(413);
  });
});
