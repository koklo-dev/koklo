import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "../src/proxy.ts";

/** TK-88 (C1, C2) : le proxy garde les routes de la coquille puis redirige les anciens chemins (307). */
const readSession = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session.ts", () => ({ readSession }));

const ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";

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
const where = (response: Response) => {
  const location = response.headers.get("location");
  return location ? `${new URL(location).pathname}${new URL(location).search}` : null;
};
const toRegExp = (pattern: string) =>
  new RegExp(`^${pattern.replace(/:[A-Za-z_]\w*\*/g, ".*").replace(/:[A-Za-z_]\w*/g, "[^/]+")}$`);
const matched = (path: string) => config.matcher.filter((pattern) => toRegExp(pattern).test(path));

const GUARDED = [
  `/projects/${ID}`,
  `/projects/${ID}/idea`,
  `/projects/${ID}/framing`,
  `/projects/${ID}/tickets`,
  `/projects/${ID}/spec/functional`,
  `/projects/${ID}/spec/security`,
  "/settings",
  "/settings/general",
  "/settings/members",
  "/settings/github",
  "/settings/ai",
  "/settings/account",
];

describe("proxy — routes de la coquille", () => {
  it.each(GUARDED)("%s : /login sans session", async (path) => {
    withSession(false);
    expect(where(await call(path))).toBe("/login");
  });

  it.each(GUARDED)("%s : /organizations sans organisation active", async (path) => {
    withSession(true, false);
    expect(where(await call(path))).toBe("/organizations");
  });

  it.each(GUARDED)("%s : laisse passer avec session et organisation", async (path) => {
    withSession(true, true);
    const response = await call(path);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(GUARDED)("%s est couvert par le matcher", (path) => {
    expect(matched(path).length).toBeGreaterThan(0);
  });

  it.each([`/projects/${ID}/spec/functional/x`, "/settings/ai/x", `/projects/${ID}/other`])(
    "%s n'est pas couvert",
    (path) => {
      expect(matched(path)).toEqual([]);
    },
  );
});

describe("proxy — anciens chemins (307, requête conservée)", () => {
  beforeEach(() => withSession(true, true));

  it("/projects/<id>/features → spec/functional?tab=features, requête conservée", async () => {
    const response = await call(`/projects/${ID}/features?q=x&sel=F-001`);
    expect(response.status).toBe(307);
    expect(where(response)).toBe(`/projects/${ID}/spec/functional?tab=features&q=x&sel=F-001`);
  });

  it("/members → /settings/members", async () => {
    const response = await call("/members");
    expect(response.status).toBe(307);
    expect(where(response)).toBe("/settings/members");
  });

  it("/github?result=installed → /settings/github?result=installed", async () => {
    expect(where(await call("/github?result=installed"))).toBe("/settings/github?result=installed");
  });

  it("sans session, la garde passe avant : jamais de redirection vers une page protégée", async () => {
    withSession(false);
    expect(where(await call("/github?result=installed"))).toBe("/login");
    expect(where(await call(`/projects/${ID}/features?q=x`))).toBe("/login");
    expect(where(await call("/members"))).toBe("/login");
  });

  it("sans organisation active : /organizations, pas la page de destination", async () => {
    withSession(true, false);
    expect(where(await call("/members"))).toBe("/organizations");
  });

  it("/kanban et /settings/ai ne sont pas redirigés par le proxy", async () => {
    for (const path of ["/kanban", "/settings/ai"]) {
      const response = await call(path);
      expect(response.headers.get("location")).toBeNull();
    }
  });
});
