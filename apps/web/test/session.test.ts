import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSession, readSession } from "../src/lib/session.ts";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: () => Promise<unknown>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("hasSession", () => {
  it("relaie le cookie et renvoie true si l'API renvoie une session", async () => {
    const fetchMock = stubFetch(async () => Response.json({ user: { id: "u1" } }));
    await expect(hasSession("http://api.test", "sid=abc")).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("http://api.test/api/auth/get-session");
    expect(init.headers).toEqual({ cookie: "sid=abc" });
  });

  it("n'envoie aucun en-tête cookie sans cookie", async () => {
    const fetchMock = stubFetch(async () => Response.json(null));
    await expect(hasSession("http://api.test", null)).resolves.toBe(false);
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).toEqual({});
  });

  it("renvoie false si l'API répond en erreur", async () => {
    stubFetch(async () => new Response("boom", { status: 500 }));
    await expect(hasSession("http://api.test", "sid=abc")).resolves.toBe(false);
  });

  it("renvoie false si l'API est injoignable", async () => {
    stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(hasSession("http://api.test", "sid=abc")).resolves.toBe(false);
  });
});

describe("readSession (TK-24, G1)", () => {
  it("signale la session et l'organisation active", async () => {
    stubFetch(async () =>
      Response.json({ user: { id: "u1" }, session: { activeOrganizationId: "org-1" } }),
    );
    await expect(readSession("http://api.test", "sid=abc")).resolves.toEqual({
      hasSession: true,
      hasActiveOrganization: true,
    });
  });

  it("signale une session sans organisation active (activeOrganizationId null)", async () => {
    stubFetch(async () =>
      Response.json({ user: { id: "u1" }, session: { activeOrganizationId: null } }),
    );
    await expect(readSession("http://api.test", "sid=abc")).resolves.toEqual({
      hasSession: true,
      hasActiveOrganization: false,
    });
  });

  it("signale l'absence de session quand l'API renvoie null", async () => {
    stubFetch(async () => Response.json(null));
    await expect(readSession("http://api.test", null)).resolves.toEqual({
      hasSession: false,
      hasActiveOrganization: false,
    });
  });

  it("signale l'absence de session si l'API est injoignable", async () => {
    stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(readSession("http://api.test", "sid=abc")).resolves.toEqual({
      hasSession: false,
      hasActiveOrganization: false,
    });
  });

  it("relaie le cookie vers /api/auth/get-session", async () => {
    const fetchMock = stubFetch(async () => Response.json(null));
    await readSession("http://api.test", "sid=abc");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe("http://api.test/api/auth/get-session");
    expect(init.headers).toEqual({ cookie: "sid=abc" });
  });
});
