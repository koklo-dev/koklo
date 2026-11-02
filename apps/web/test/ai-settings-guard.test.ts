import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config.ts";
import { guardedPathFor, resolveAccess } from "../src/lib/auth-guard.ts";
import { config, proxy } from "../src/proxy.ts";

/**
 * Réglages de l'IA (S-ai-settings §2, §5, §11) : la route `/settings/ai` est gardée comme `/github` (session,
 * organisation active) ; ses voisins ne le sont pas ; la page porte `Cache-Control: no-store` et
 * `Referrer-Policy: no-referrer` (la saisie d'une clé ne doit ni être mise en cache ni fuiter par le Referer).
 */
const readSession = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session.ts", () => ({ readSession }));

const AI = "/settings/ai";
/** Le type `GuardedPath` ne connaît pas encore `/settings/ai` : le Green l'élargit (src/lib/auth-guard.ts). */
const AI_PATH = AI as Parameters<typeof resolveAccess>[0]["path"];

beforeEach(() => {
  vi.stubEnv("API_INTERNAL_URL", "http://api.internal:3001");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("APP_VERSION", "0.0.0");
  readSession.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const call = (path: string) => proxy(new NextRequest(`http://web.test${path}`));
const redirectedTo = (response: Response) => {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
};
const toRegExp = (pattern: string) =>
  new RegExp(`^${pattern.replace(/:[A-Za-z_]\w*\*/g, ".*").replace(/:[A-Za-z_]\w*/g, "[^/]+")}$`);
const matched = (path: string) => config.matcher.filter((pattern) => toRegExp(pattern).test(path));

const NEIGHBOURS = [
  "/settings",
  "/settings/",
  "/settings/ai/",
  "/settings/ai/x",
  "/settings/other",
  "/settings/aix",
  "/ai",
  "/admin/settings/ai",
];

describe("auth-guard — /settings/ai", () => {
  it("chemin exact gardé", () => {
    expect(guardedPathFor(AI)).toBe(AI);
  });

  it("sans session /login ; session sans organisation active /organizations ; sinon accès permis", () => {
    expect(resolveAccess({ path: AI_PATH, hasSession: false })).toBe("/login");
    expect(resolveAccess({ path: AI_PATH, hasSession: true, hasActiveOrganization: false })).toBe(
      "/organizations",
    );
    expect(
      resolveAccess({ path: AI_PATH, hasSession: true, hasActiveOrganization: true }),
    ).toBeNull();
  });

  it.each(NEIGHBOURS)("chemin voisin %s non traité comme gardé", (path) => {
    expect(guardedPathFor(path)).toBeNull();
  });

  it("les chemins gardés existants le restent", () => {
    for (const path of [
      "/login",
      "/projects",
      "/kanban",
      "/members",
      "/github",
      "/organizations",
    ]) {
      expect(guardedPathFor(path)).toBe(path);
    }
  });
});

describe("proxy — /settings/ai", () => {
  it("redirige vers /login sans session", async () => {
    readSession.mockResolvedValue({ hasSession: false, hasActiveOrganization: false });
    expect(redirectedTo(await call(AI))).toBe("/login");
  });

  it("redirige vers /organizations avec session sans organisation active", async () => {
    readSession.mockResolvedValue({ hasSession: true, hasActiveOrganization: false });
    expect(redirectedTo(await call(AI))).toBe("/organizations");
  });

  it("laisse passer avec session et organisation active", async () => {
    readSession.mockResolvedValue({ hasSession: true, hasActiveOrganization: true });
    const response = await call(AI);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(NEIGHBOURS)(
    "chemin voisin %s : pas de lecture de session ni de redirection",
    async (path) => {
      readSession.mockResolvedValue({ hasSession: false, hasActiveOrganization: false });
      const response = await call(path);
      expect(readSession).not.toHaveBeenCalled();
      expect(response.headers.get("location")).toBeNull();
    },
  );
});

describe("matcher du proxy — /settings/ai", () => {
  it("couvre /settings/ai", () => {
    expect(matched(AI).length).toBeGreaterThan(0);
  });

  it.each(NEIGHBOURS)("ne couvre pas le chemin voisin %s", (path) => {
    expect(matched(path)).toEqual([]);
  });

  it("n'affaiblit pas les entrées existantes", () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining([
        "/login",
        "/projects",
        "/projects/:projectId/features",
        "/projects/:projectId/framing",
        "/kanban",
        "/members",
        "/github",
        "/organizations",
        "/accept-invitation/:id",
        "/api/auth/:path*",
        "/api/orpc/:path*",
        "/api/webhooks/github",
        "/api/github/callback",
      ]),
    );
  });
});

describe("en-têtes de la route /settings/ai (next.config.ts)", () => {
  type Rule = { source: string; headers: Array<{ key: string; value: string }> };
  const rules = async (): Promise<Rule[]> => (await nextConfig.headers?.()) ?? [];
  const headerValue = (rule: Rule | undefined, key: string) =>
    rule?.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value;

  it("`headers()` est défini et porte une règle pour exactement /settings/ai", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    expect((await rules()).some((rule) => rule.source === AI)).toBe(true);
  });

  it("Cache-Control: no-store et Referrer-Policy: no-referrer", async () => {
    const rule = (await rules()).find((candidate) => candidate.source === AI);
    expect(headerValue(rule, "Cache-Control")).toBe("no-store");
    expect(headerValue(rule, "Referrer-Policy")).toBe("no-referrer");
  });

  it("limités à cette route : aucune règle générale ne pose ces en-têtes ailleurs", async () => {
    const others = (await rules()).filter((rule) => rule.source !== AI);
    for (const rule of others) {
      expect(headerValue(rule, "Referrer-Policy"), rule.source).not.toBe("no-referrer");
      expect(headerValue(rule, "Cache-Control"), rule.source).not.toBe("no-store");
    }
  });
});
