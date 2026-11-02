import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardedPathFor, resolveAccess } from "../src/lib/auth-guard.ts";
import { config, proxy } from "../src/proxy.ts";

/**
 * TK-59 / 59a : la route `/projects/<projectId>/framing` est gardée comme `/features` (session, organisation
 * active) ; ses voisins ne le sont pas (404 Next), sans contournement.
 */
const readSession = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session.ts", () => ({ readSession }));

const ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const FRAMING = `/projects/${ID}/framing`;
/** Le type `GuardedPath` ne connaît pas encore `/framing` : le Green l'élargit (src/lib/auth-guard.ts). */
const FRAMING_PATH = FRAMING as Parameters<typeof resolveAccess>[0]["path"];

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

describe("auth-guard", () => {
  it("la page de cadrage est gardée, uuid ou non", () => {
    expect(guardedPathFor(FRAMING)).toBe(FRAMING);
    expect(guardedPathFor("/projects/pas-un-uuid/framing")).toBe("/projects/pas-un-uuid/framing");
  });

  it("sans session /login ; session sans organisation active /organizations", () => {
    expect(resolveAccess({ path: FRAMING_PATH, hasSession: false })).toBe("/login");
    expect(
      resolveAccess({ path: FRAMING_PATH, hasSession: true, hasActiveOrganization: false }),
    ).toBe("/organizations");
  });

  it.each([`${FRAMING}/`, `${FRAMING}/x`, `/projects/${ID}/framings`, "/projects/a/b/framing"])(
    "chemin voisin %s non traité comme gardé",
    (path) => {
      expect(guardedPathFor(path)).toBeNull();
    },
  );
});

describe("proxy", () => {
  it("redirige vers /login sans session et vers /organizations sans organisation active", async () => {
    readSession.mockResolvedValue({ hasSession: false, hasActiveOrganization: false });
    expect(redirectedTo(await call(FRAMING))).toBe("/login");
    readSession.mockResolvedValue({ hasSession: true, hasActiveOrganization: false });
    expect(redirectedTo(await call(FRAMING))).toBe("/organizations");
  });

  it("laisse passer avec session et organisation active", async () => {
    readSession.mockResolvedValue({ hasSession: true, hasActiveOrganization: true });
    const response = await call(FRAMING);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("le matcher couvre /projects/<un segment>/framing par un paramètre nommé, sans joker", () => {
    expect(matched(FRAMING).length).toBeGreaterThan(0);
    expect(config.matcher.some((p) => /^\/projects\/:[A-Za-z_]\w*\/framing$/.test(p))).toBe(true);
    expect(matched(`${FRAMING}/x`)).toEqual([]);
  });

  it("n'affaiblit pas la garde des fonctionnalités", () => {
    expect(matched(`/projects/${ID}/features`).length).toBeGreaterThan(0);
  });
});
