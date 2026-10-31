import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "../src/proxy.ts";

/** TK-48 / 48d : garde et matcher du proxy sur la route dynamique `/projects/<projectId>/features`. */
const readSession = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session.ts", () => ({ readSession }));

const ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const FEATURES = `/projects/${ID}/features`;

beforeEach(() => {
  vi.stubEnv("API_INTERNAL_URL", "http://api.internal:3001");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("APP_VERSION", "0.0.0");
  readSession.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const withSession = (hasSession: boolean, hasActiveOrganization = hasSession) =>
  readSession.mockResolvedValue({ hasSession, hasActiveOrganization });
const call = (path: string) => proxy(new NextRequest(`http://web.test${path}`));
const redirectedTo = (response: Response) => {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
};

/** Convertit un motif du matcher Next (`:param`, `:param*`) en expression régulière pour le tester. */
const toRegExp = (pattern: string) =>
  new RegExp(`^${pattern.replace(/:[A-Za-z_]\w*\*/g, ".*").replace(/:[A-Za-z_]\w*/g, "[^/]+")}$`);
const matched = (path: string) => config.matcher.filter((pattern) => toRegExp(pattern).test(path));

describe("proxy — /projects/<projectId>/features", () => {
  it("redirige vers /login sans session", async () => {
    withSession(false);
    expect(redirectedTo(await call(FEATURES))).toBe("/login");
  });

  it("redirige vers /organizations avec session sans organisation active", async () => {
    withSession(true, false);
    expect(redirectedTo(await call(FEATURES))).toBe("/organizations");
  });

  it("laisse passer avec session et organisation active", async () => {
    withSession(true, true);
    const response = await call(FEATURES);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("garde aussi un identifiant qui n'est pas un uuid", async () => {
    withSession(false);
    expect(redirectedTo(await call("/projects/pas-un-uuid/features"))).toBe("/login");
  });

  it.each([`/projects/${ID}`, `/projects/${ID}/features/x`, `/projects/${ID}/other`])(
    "chemin voisin %s : pas de lecture de session ni de redirection (404 Next)",
    async (path) => {
      withSession(false);
      const response = await call(path);
      expect(readSession).not.toHaveBeenCalled();
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );
});

describe("matcher du proxy — route dynamique", () => {
  it("couvre /projects/<un segment>/features", () => {
    expect(matched(FEATURES).length).toBeGreaterThan(0);
    expect(matched("/projects/pas-un-uuid/features").length).toBeGreaterThan(0);
  });

  it("le motif utilise un paramètre nommé à un segment (pas de joker qui ouvrirait /projects/**)", () => {
    expect(
      config.matcher.some((pattern) => /^\/projects\/:[A-Za-z_]\w*\/features$/.test(pattern)),
    ).toBe(true);
  });

  it.each([
    `/projects/${ID}`,
    `/projects/${ID}/features/x`,
    `/projects/${ID}/other`,
    "/projects/a/b/features",
  ])("ne couvre pas le chemin voisin %s", (path) => {
    expect(matched(path)).toEqual([]);
  });

  it("n'affaiblit pas les entrées existantes", () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining([
        "/login",
        "/projects",
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
