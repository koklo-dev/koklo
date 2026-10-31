import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../src/proxy.ts";

const readSession = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session.ts", () => ({ readSession }));

beforeEach(() => {
  vi.stubEnv("API_INTERNAL_URL", "http://api.internal:3001");
  vi.stubEnv("API_URL", "http://ancienne.invalid:9");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("APP_VERSION", "0.0.0");
  readSession.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const QUERY = "?installation_id=42&code=abc&state=s.ig&setup_action=install";
const get = (path: string, cookie?: string) =>
  proxy(new NextRequest(`http://web.test${path}`, cookie ? { headers: { cookie } } : undefined));

/**
 * TK-48a2 (AC-48-12) : GitHub renvoie le navigateur sur `/api/github/callback`. Le web relaie vers
 * l'API avec le cookie de session (l'API arbitre : session absente = `invalid_state`), sans jamais
 * rediriger vers /login, et sans ouvrir d'autre chemin.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas du relais, un test par comportement
describe("relais web de /api/github/callback (TK-48a2)", () => {
  it("réécrit vers l'API au même chemin en conservant toute la query", async () => {
    const response = await get(`/api/github/callback${QUERY}`, "better-auth.session_token=abc");
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `http://api.internal:3001/api/github/callback${QUERY}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("relaie même sans session (pas de redirection vers /login : l'API répond invalid_state)", async () => {
    readSession.mockResolvedValue({ hasSession: false, hasActiveOrganization: false });
    const response = await get(`/api/github/callback${QUERY}`);
    expect(response.status).not.toBe(307);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/api/github/callback");
  });

  it("ne dépend pas de la session pour relayer (aucune lecture de session)", async () => {
    await get(`/api/github/callback${QUERY}`, "better-auth.session_token=abc");
    expect(readSession).not.toHaveBeenCalled();
  });

  it.each([
    "/api/github/installed",
    "/api/github/callback/",
    "/api/github/callbackx",
    "/api/github/callback/extra",
    "/api/github",
    "/api/github/",
    "/api/github/other",
  ])("ne relaie pas %s (chemin exact seulement, /installed n'est pas construit)", async (path) => {
    readSession.mockResolvedValue({ hasSession: true, hasActiveOrganization: true });
    const response = await get(`${path}${QUERY}`);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("le matcher contient /api/github/callback exactement, sans joker ni /installed", async () => {
    const { config } = await import("../src/proxy.ts");
    expect(config.matcher).toContain("/api/github/callback");
    expect(config.matcher).not.toContain("/api/github/installed");
    expect(config.matcher.filter((m) => m.startsWith("/api/github"))).toEqual([
      "/api/github/callback",
    ]);
  });

  it("n'altère pas le matcher existant ni les relais voisins", async () => {
    const { config } = await import("../src/proxy.ts");
    for (const entry of [
      "/login",
      "/projects",
      "/kanban",
      "/members",
      "/organizations",
      "/accept-invitation/:id",
      "/api/auth/:path*",
      "/api/orpc/:path*",
      "/api/webhooks/github",
    ]) {
      expect(config.matcher, entry).toContain(entry);
    }
    const webhook = await get("/api/webhooks/github");
    expect(webhook.headers.get("x-middleware-rewrite")).toBe(
      "http://api.internal:3001/api/webhooks/github",
    );
    const auth = await get("/api/auth/sign-in/social?x=1");
    expect(auth.headers.get("x-middleware-rewrite")).toBe(
      "http://api.internal:3001/api/auth/sign-in/social?x=1",
    );
  });
});
