import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import { createMagicLinkApp, logSink, requestMagicLink, SEED_EMAIL } from "./helpers/magic-link.ts";

/**
 * TK-22 C1 (côté api) : la demande de lien ne fait qu'enfiler le job send-magic-link et rend la
 * main. Aucun worker n'est lancé : le job reste en file et se lit tel que le worker le recevra.
 */
const QUEUE = "send-magic-link";

let database: TestDatabase;
let app: INestApplication;
let boss: PgBoss;

beforeAll(async () => {
  database = await createSeededDatabase();
  // Le worker possède la création de la file ; ici le test en tient lieu.
  boss = new PgBoss(database.url);
  await boss.start();
  await boss.createQueue(QUEUE);
  app = await createMagicLinkApp(database.url, logSink());
});

afterAll(async () => {
  await app?.close();
  await boss?.stop();
  await database?.dispose();
});

describe("api : demande de lien magique (TK-22 C1)", () => {
  it("POST /api/auth/sign-in/magic-link répond status true et enfile un job { email, url }", async () => {
    const response = await requestMagicLink(app, SEED_EMAIL);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: true });

    const jobs = await boss.fetch<{ email: string; url: string }>(QUEUE, { batchSize: 5 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data.email).toBe(SEED_EMAIL);
    const url = new URL(jobs[0]?.data.url ?? "");
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe("/api/auth/magic-link/verify");
    expect(url.searchParams.get("token")).toBeTruthy();
  });
});
