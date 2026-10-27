import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createApp,
  createSeededDatabase,
  TEST_AUTH_URL,
  TEST_GITHUB_CLIENT_ID,
} from "./helpers/app.ts";

let database: TestDatabase;
let app: INestApplication;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  database = await createSeededDatabase();
  app = await createApp({ databaseUrl: database.url });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await app?.close();
  await database?.dispose();
});

function signInGithub() {
  return request(app.getHttpServer())
    .post("/api/auth/sign-in/social")
    .set("Origin", TEST_AUTH_URL)
    .send({ provider: "github", callbackURL: "/" });
}

/** Simule GitHub au niveau HTTP sortant ; tout le reste passe par le vrai fetch. */
function stubGithub() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://github.com/login/oauth/access_token")) {
      calls.push("token");
      return Response.json({ access_token: "gho_fake", token_type: "bearer", scope: "user:email" });
    }
    if (url === "https://api.github.com/user") {
      calls.push("user");
      return Response.json({
        id: 424242,
        login: "octo-test",
        name: "Octo Test",
        email: "octo@example.test",
        avatar_url: "https://example.test/a.png",
      });
    }
    if (url === "https://api.github.com/user/emails") {
      calls.push("emails");
      return Response.json([
        { email: "octo@example.test", primary: true, verified: true, visibility: "public" },
      ]);
    }
    return realFetch(input, init);
  });
  return calls;
}

describe("parcours OAuth GitHub (C6)", () => {
  it("C6 les routes /api/auth/* sont montées et renvoient l'URL d'autorisation GitHub", async () => {
    const response = await signInGithub();
    expect(response.status).toBe(200);
    const url = new URL(response.body.url);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(TEST_GITHUB_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(`${TEST_AUTH_URL}/api/auth/callback/github`);
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("C6 le corps JSON des routes d'auth est lu (n'interfère pas avec oRPC)", async () => {
    // Si le body parsing était consommé en amont, le fournisseur serait absent : 400/422.
    const response = await signInGithub();
    expect(response.status).toBe(200);
    const unknown = await request(app.getHttpServer())
      .post("/api/auth/sign-in/social")
      .set("Origin", TEST_AUTH_URL)
      .send({ provider: "inexistant" });
    expect(unknown.status).toBeGreaterThanOrEqual(400);
    expect(unknown.status).toBeLessThan(500);
  });
});

describe("callback OAuth GitHub (C6)", () => {
  it("C6 le callback échange le code (GitHub simulé), crée utilisateur et compte, émet la session", async () => {
    const start = await signInGithub();
    const state = new URL(start.body.url).searchParams.get("state") as string;
    const cookies = (start.headers["set-cookie"] ?? []) as string[];
    const calls = stubGithub();

    const callback = await request(app.getHttpServer())
      .get(`/api/auth/callback/github?code=fake-code&state=${state}`)
      .set("Cookie", cookies.map((cookie) => cookie.split(";")[0]).join("; "));

    expect(callback.status).toBe(302);
    expect(calls).toContain("token");
    expect(calls).toContain("user");
    const setCookies = ((callback.headers["set-cookie"] ?? []) as string[]).join("\n");
    expect(setCookies).toContain("better-auth.session_token=");

    const users = await database.query("SELECT id FROM users WHERE email = $1", [
      "octo@example.test",
    ]);
    expect(users).toHaveLength(1);
    const accounts = await database.query(
      "SELECT provider_id FROM accounts WHERE account_id = '424242'",
    );
    expect(accounts).toEqual([{ provider_id: "github" }]);
  });

  it("C6 un state inconnu au callback ne crée aucune session", async () => {
    const calls = stubGithub();
    const callback = await request(app.getHttpServer()).get(
      "/api/auth/callback/github?code=fake-code&state=etat-inconnu",
    );
    const setCookie = [callback.headers["set-cookie"] ?? []].flat().join("\n");
    expect(setCookie).not.toContain("better-auth.session_token=");
    expect(calls).not.toContain("user");
  });
});
