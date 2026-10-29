import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveNextPath } from "../src/lib/next-path.ts";
import { proxy } from "../src/proxy.ts";

const readSession = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session.ts", () => ({ readSession }));

const ID = "01900000-0000-7000-8000-0000000000b1";
const PATH = `/accept-invitation/${ID}`;

beforeEach(() => {
  vi.stubEnv("API_INTERNAL_URL", "http://api.internal:3001");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("APP_VERSION", "0.0.0");
  readSession.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const call = (path: string) => proxy(new NextRequest(`http://web.test${path}`));
const withSession = (hasSession: boolean, hasActiveOrganization: boolean) =>
  readSession.mockResolvedValue({ hasSession, hasActiveOrganization });

describe("C3.a : proxy sans session", () => {
  it("redirige /accept-invitation/<uuid> vers /login en conservant la destination dans `next`", async () => {
    withSession(false, false);
    const response = await call(PATH);
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(PATH);
  });

  it("C4.a : la redirection est identique pour un id existant et pour un id inconnu (aucun oracle)", async () => {
    withSession(false, false);
    const known = await call(PATH);
    const unknown = await call("/accept-invitation/01900000-0000-7000-8000-00000000ffff");
    const shape = (r: Response) => [r.status, new URL(r.headers.get("location") ?? "").pathname];
    expect(shape(unknown)).toEqual(shape(known));
  });

  it("n'embarque l'id dans `next` que pour un UUID (rien d'autre n'est conservé)", async () => {
    withSession(false, false);
    const response = await call("/accept-invitation/abc");
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBeNull();
  });
});

describe("C3.d : proxy avec session", () => {
  it.each([
    ["sans organisation active (nouvel invité)", false],
    ["avec organisation active", true],
  ])("laisse passer la route %s (jamais de renvoi vers /organizations)", async (_label, active) => {
    withSession(true, active);
    const response = await call(PATH);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("C4.e : la réponse n'est pas mise en cache partagée (Cache-Control: no-store)", async () => {
    withSession(true, false);
    const response = await call(PATH);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("garde la route dans le matcher du proxy", async () => {
    const { config } = await import("../src/proxy.ts");
    expect(config.matcher).toEqual(expect.arrayContaining(["/accept-invitation/:id"]));
  });
});

describe("C3.c : resolveNextPath (liste blanche, pas de redirection ouverte)", () => {
  it("accepte /accept-invitation/<uuid>", () => {
    expect(resolveNextPath(PATH)).toBe(PATH);
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["vide", ""],
    ["schéma-relatif", "//evil.com"],
    ["URL absolue", "https://evil.com/accept-invitation/" + ID],
    ["antislash", "/\\evil.com"],
    ["autre chemin interne", "/members"],
    ["préfixe sans UUID", "/accept-invitation/abc"],
    ["UUID avec suffixe", `${PATH}/../../projects`],
    ["UUID avec query", `${PATH}?x=https://evil.com`],
    ["UUID avec fragment", `${PATH}#x`],
    ["javascript:", "javascript:alert(1)"],
    ["encodé", "%2F%2Fevil.com"],
  ])("%s est ignoré et ramène à /projects", (_label, value) => {
    expect(resolveNextPath(value as string | null | undefined)).toBe("/projects");
  });
});
