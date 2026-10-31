import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  createWebhookApp,
  expectNothingWritten,
  MAX_BODY,
  OTHER_SECRET,
  postWebhook,
  pushBody,
  rawRequest,
  resetIngestion,
  sign,
  startQueueBoss,
  utf8,
} from "./helpers/webhooks.ts";

/**
 * TK-45c1, CA-2 : ordre des contrôles 413 / 415 / 401 / 400 de `POST /api/webhooks/github`
 * (le 503 sans secret est dans webhook-secret-missing.test.ts) ; un rejet n'écrit jamais rien.
 */
let database: TestDatabase;
let boss: PgBoss;
let app: INestApplication;
const body = utf8(pushBody());

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

describe("signature invalide (CA-2) : 401, rien d'écrit, réponse identique", () => {
  const upper = (value: string) => `sha256=${value.slice(7).toUpperCase()}`;
  const cases: Array<[string, () => Parameters<typeof postWebhook>[1]]> = [
    ["en-tête absent", () => ({ body, signature: null })],
    ["sans préfixe sha256=", () => ({ body, signature: sign(body).slice(7) })],
    ["hexadécimal trop court", () => ({ body, signature: sign(body).slice(0, -2) })],
    ["hexadécimal trop long", () => ({ body, signature: `${sign(body)}00` })],
    ["caractères non hexadécimaux", () => ({ body, signature: `sha256=${"zz".repeat(32)}` })],
    ["sha1= seul", () => ({ body, signature: `sha1=${sign(body).slice(7, 47)}` })],
    ["vide", () => ({ body, signature: "" })],
    ["préfixe seul", () => ({ body, signature: "sha256=" })],
    [
      "corps modifié d'un octet après signature",
      () => ({ body: Buffer.concat([body, Buffer.from(" ")]), signature: sign(body) }),
    ],
    ["signature d'un autre secret", () => ({ body, secret: OTHER_SECRET })],
    ["signature de la chaîne vide (clé vide)", () => ({ body, signature: sign(body, "") })],
  ];

  it.each(cases)("%s", async (_label, delivery) => {
    const response = await postWebhook(app, delivery());
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "invalid_signature" });
    await expectNothingWritten(database);
  });

  it("deux en-têtes X-Hub-Signature-256 dupliqués (l'un valide) : rejet", async () => {
    const response = await rawRequest(app, {
      headers: {
        "content-type": "application/json",
        "content-length": String(body.length),
        "x-hub-signature-256": [sign(body), sign(body, OTHER_SECRET)],
        "x-github-delivery": "6f1c0a52-3b7e-4d6a-9a1e-0c2f4b8d7e11",
        "x-github-event": "push",
      },
      payload: body,
    });
    expect(response.status).toBe(401);
    await expectNothingWritten(database);
  });

  it("le seul X-Hub-Signature (SHA-1) valide n'authentifie jamais", async () => {
    const response = await postWebhook(app, { body, signature: null }).set(
      "X-Hub-Signature",
      "sha1=0000000000000000000000000000000000000000",
    );
    expect(response.status).toBe(401);
    await expectNothingWritten(database);
  });

  it("majuscules et minuscules hexadécimales sont équivalentes (acceptation)", async () => {
    const response = await postWebhook(app, { body, signature: upper(sign(body)) });
    expect(response.status).toBe(202);
  });
});

describe("type de contenu : 415 avant la signature", () => {
  it.each(["text/plain", "application/x-www-form-urlencoded", "application/xml"])(
    "%s est refusé en 415, même avec une signature fausse",
    async (contentType) => {
      const response = await postWebhook(app, { body, contentType, signature: "sha256=faux" });
      expect(response.status).toBe(415);
      await expectNothingWritten(database);
    },
  );

  it("type absent : 415", async () => {
    const response = await postWebhook(app, { body, contentType: null });
    expect(response.status).toBe(415);
    await expectNothingWritten(database);
  });

  it("application/json; charset=utf-8 est accepté", async () => {
    const response = await postWebhook(app, {
      body,
      contentType: "application/json; charset=utf-8",
    });
    expect(response.status).toBe(202);
  });
});

describe("taille : 413 avant le type et avant la lecture du corps", () => {
  const headers = (length: number, contentType: string) => ({
    "content-type": contentType,
    "content-length": String(length),
    "x-hub-signature-256": "sha256=faux",
    "x-github-delivery": "6f1c0a52-3b7e-4d6a-9a1e-0c2f4b8d7e11",
    "x-github-event": "push",
  });

  it("Content-Length > 5 Mio : 413 sans attendre le corps, même avec un type et une signature faux", async () => {
    const result = await rawRequest(app, { headers: headers(MAX_BODY + 1, "text/plain") });
    expect(result.status).toBe(413);
    await expectNothingWritten(database);
  });

  it("corps réel > 5 Mio avec Content-Length menteur (transfert par morceaux) : 413", async () => {
    const result = await rawRequest(app, {
      headers: {
        "content-type": "application/json",
        "transfer-encoding": "chunked",
        "x-hub-signature-256": "sha256=faux",
        "x-github-delivery": "6f1c0a52-3b7e-4d6a-9a1e-0c2f4b8d7e11",
        "x-github-event": "push",
      },
      payload: Buffer.alloc(MAX_BODY + 4096, 0x20),
    });
    expect(result.status).toBe(413);
    await expectNothingWritten(database);
  });

  it("sans Content-Length (transfert par morceaux), un corps signé de 4 Mio est accepté", async () => {
    const big = utf8({ ...pushBody(), padding: "x".repeat(4 * 1024 * 1024) });
    const result = await rawRequest(app, {
      headers: {
        "content-type": "application/json",
        "transfer-encoding": "chunked",
        "x-hub-signature-256": sign(big),
        "x-github-delivery": "7a2d1b63-4c8f-4e7b-8b2f-1d3a5c9e8f22",
        "x-github-event": "push",
      },
      payload: big,
    });
    expect(result.status).toBe(202);
  });

  it("un corps signé de 4 Mio est accepté (la limite par défaut de 100 ko ne s'applique pas ici)", async () => {
    const big = utf8({ ...pushBody(), padding: "x".repeat(4 * 1024 * 1024) });
    const response = await postWebhook(app, { body: big });
    expect(response.status).toBe(202);
  });
});

describe("en-têtes et corps : 400 après une signature valide", () => {
  it.each([
    ["X-GitHub-Delivery absent", { deliveryId: null }],
    ["X-GitHub-Delivery non UUID", { deliveryId: "pas-un-uuid" }],
    ["X-GitHub-Delivery trop long", { deliveryId: `${"a".repeat(36)}b` }],
    ["X-GitHub-Event absent", { event: null }],
    ["X-GitHub-Event hors motif", { event: "Push;DROP" }],
    ["X-GitHub-Event trop long", { event: "a".repeat(65) }],
  ] as const)("%s", async (_label, over) => {
    const response = await postWebhook(app, { body, ...over });
    expect(response.status).toBe(400);
    await expectNothingWritten(database);
  });

  it("signature fausse ET en-tête invalide : 401 (la signature passe avant les en-têtes)", async () => {
    const response = await postWebhook(app, { body, signature: "sha256=faux", deliveryId: null });
    expect(response.status).toBe(401);
  });

  it.each([
    ["JSON invalide", Buffer.from("{ pas du json")],
    ["corps vide", Buffer.alloc(0)],
    ["tableau", Buffer.from("[]")],
    ["null", Buffer.from("null")],
    ["chaîne", Buffer.from('"push"')],
    ["UTF-8 invalide", Buffer.from([0x7b, 0xff, 0xfe, 0x7d])],
  ])("%s (signé) : 400, rien d'écrit", async (_label, raw) => {
    const response = await postWebhook(app, { body: raw });
    expect(response.status).toBe(400);
    await expectNothingWritten(database);
  });
});

describe("événements non gérés : 202 sans écriture, après la signature", () => {
  it.each(["ping", "star", "fork", "evenement_inconnu"])(
    "%s signé : 202 { received: true }, 0 ligne, 0 job",
    async (event) => {
      const response = await postWebhook(app, {
        body: utf8({ zen: "Keep it logically awesome." }),
        event,
      });
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ received: true });
      await expectNothingWritten(database);
    },
  );

  it("un événement inconnu mal signé reste un 401", async () => {
    const response = await postWebhook(app, { body, event: "ping", secret: OTHER_SECRET });
    expect(response.status).toBe(401);
  });
});
