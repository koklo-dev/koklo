import type { TestDatabase } from "@koklo/db/testing";
import type { CaptureMailSender, Worker } from "@koklo/worker";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSeededDatabase } from "./helpers/app.ts";
import {
  cookiesOf,
  createMagicLinkApp,
  logSink,
  type MagicLink,
  nextMagicLink,
  requestMagicLink,
  SEED_EMAIL,
  startCaptureWorker,
} from "./helpers/magic-link.ts";

/**
 * TK-22 : parcours complet api -> pg-boss -> worker -> email capturé -> lien -> session, avec
 * Postgres éphémère, sans aucune clé Resend (C8).
 */
const sink = logSink();
let database: TestDatabase;
let app: INestApplication;
let worker: Worker;
let sender: CaptureMailSender;
let received = 0;

beforeAll(async () => {
  database = await createSeededDatabase();
  ({ worker, sender } = await startCaptureWorker(database.url, sink));
  app = await createMagicLinkApp(database.url, sink);
});

beforeEach(() => {
  sink.lines.length = 0;
});

afterAll(async () => {
  await app?.close();
  await worker?.stop();
  await database?.dispose();
});

async function issueLink(email = SEED_EMAIL): Promise<MagicLink> {
  expect((await requestMagicLink(app, email)).status).toBe(200);
  received += 1;
  return nextMagicLink(sender, received);
}

const verify = (link: Pick<MagicLink, "path">) => request(app.getHttpServer()).get(link.path);
const sessionCount = async () =>
  (await database.query<{ n: number }>("SELECT count(*)::int AS n FROM sessions"))[0]?.n ?? 0;

describe("flux complet (TK-22 C1, C2)", () => {
  it("C1 la demande aboutit à exactement un email capturé, au bon destinataire, vers BETTER_AUTH_URL", async () => {
    const before = sender.sent.length;
    const link = await issueLink();
    expect(sender.sent).toHaveLength(before + 1);
    expect(sender.sent.at(-1)?.to).toBe(SEED_EMAIL);
    expect(link.url.startsWith("http://localhost:3000/")).toBe(true);
    expect(link.token.length).toBeGreaterThanOrEqual(16);
  });

  it("C2 ouvrir le lien crée une session : cookie posé, get-session renvoie l'utilisateur", async () => {
    const link = await issueLink();
    const response = await verify(link);
    expect(response.status).toBe(302);
    const cookies = cookiesOf(response);
    expect(cookies.some((cookie) => cookie.includes("session_token"))).toBe(true);

    const session = await request(app.getHttpServer())
      .get("/api/auth/get-session")
      .set("Cookie", cookies);
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe(SEED_EMAIL);
  });

  it("le jeton n'est pas stocké en clair et vit au plus 600 s", async () => {
    const link = await issueLink();
    const rows = await database.query<{ identifier: string; value: string; ttl: number }>(
      "SELECT identifier, value, extract(epoch FROM expires_at - created_at)::float AS ttl FROM verifications",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.identifier).not.toContain(link.token);
      expect(row.value).not.toContain(link.token);
    }
    expect(Math.max(...rows.map((row) => row.ttl))).toBeLessThanOrEqual(600);
  });
});

describe("refus (TK-22 C3, C4, C5)", () => {
  it("C3 lien expiré : refusé, aucune session créée", async () => {
    const link = await issueLink();
    await database.query("UPDATE verifications SET expires_at = now() - interval '1 minute'");
    const before = await sessionCount();
    const response = await verify(link);
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("error=");
    expect(cookiesOf(response)).toEqual([]);
    expect(await sessionCount()).toBe(before);
  });

  it("C4 usage unique : le second appel du même lien est refusé", async () => {
    const link = await issueLink();
    expect(cookiesOf(await verify(link)).length).toBeGreaterThan(0);
    const before = await sessionCount();
    const second = await verify(link);
    expect(second.headers.location).toContain("error=INVALID_TOKEN");
    expect(cookiesOf(second)).toEqual([]);
    expect(await sessionCount()).toBe(before);
  });

  it("C5 jeton altéré ou inventé : refusé, aucune session", async () => {
    const link = await issueLink();
    const flipped = link.token.slice(0, -1) + (link.token.endsWith("a") ? "b" : "a");
    const before = await sessionCount();
    for (const token of [flipped, "x".repeat(32), "inconnu"]) {
      const response = await verify({
        path: `/api/auth/magic-link/verify?token=${token}&callbackURL=%2F`,
      });
      expect(response.headers.location).toContain("error=INVALID_TOKEN");
      expect(cookiesOf(response)).toEqual([]);
    }
    expect(await sessionCount()).toBe(before);
  });
});

describe("journaux (TK-22 C6)", () => {
  it("C6 ni le jeton ni l'URL du lien n'apparaissent dans les journaux de l'api ni du worker", async () => {
    const link = await issueLink();
    await verify(link);
    await verify(link); // second appel : échec, journalisé lui aussi
    await new Promise((resolve) => setImmediate(resolve));
    const output = sink.lines.join("\n");
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain(link.token);
    expect(output).not.toContain(link.url);
    expect(output).not.toContain("token=");
  });
});
