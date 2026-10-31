import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../src/proxy.ts";

const readSession = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session.ts", () => ({ readSession }));

const withSession = (hasSession: boolean, hasActiveOrganization = hasSession) =>
  readSession.mockResolvedValue({ hasSession, hasActiveOrganization });

beforeEach(() => {
  vi.stubEnv("API_INTERNAL_URL", "http://api.internal:3001");
  vi.stubEnv("API_URL", "http://ancienne.invalid:9");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("APP_VERSION", "0.0.0");
  readSession.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const call = (path: string) => proxy(new NextRequest(`http://web.test${path}`));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'un écran, un test par comportement
describe("proxy", () => {
  it("relaie /api/auth/* vers l'API en conservant la query", async () => {
    const response = await call("/api/auth/sign-in/social?x=1");
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://api.internal:3001/api/auth/sign-in/social?x=1",
    );
    expect(readSession).not.toHaveBeenCalled();
  });

  it("relaie /api/orpc/* vers l'API sans le préfixe", async () => {
    const response = await call("/api/orpc/projects");
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://api.internal:3001/projects");
  });

  describe("webhooks GitHub (TK-45c1)", () => {
    const post = (path: string) =>
      proxy(
        new NextRequest(`http://web.test${path}`, {
          method: "POST",
          body: "{}",
          headers: { "x-hub-signature-256": "sha256=00", "x-github-event": "push" },
        }),
      );

    it("relaie /api/webhooks/github vers l'API au même chemin, sans lire la session", async () => {
      const response = await post("/api/webhooks/github");
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        "http://api.internal:3001/api/webhooks/github",
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(readSession).not.toHaveBeenCalled();
    });

    it("n'exige ni cookie ni session : aucune redirection même sans session", async () => {
      withSession(false);
      const response = await post("/api/webhooks/github");
      expect(response.status).not.toBe(307);
      expect(response.headers.get("x-middleware-rewrite")).toContain("/api/webhooks/github");
      expect(readSession).not.toHaveBeenCalled();
    });

    it("ne relaie que ce chemin exact : un autre chemin /api/webhooks/* n'est pas réécrit", async () => {
      withSession(true);
      const response = await post("/api/webhooks/autre");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it("est dans le matcher du proxy", async () => {
      const { config } = await import("../src/proxy.ts");
      expect(config.matcher).toContain("/api/webhooks/github");
    });
  });

  it("redirige /projects vers /login sans session", async () => {
    withSession(false);
    const response = await call("/projects");
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it("redirige /login vers /projects avec session", async () => {
    withSession(true);
    const response = await call("/login");
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/projects");
  });

  it("laisse passer /projects avec session", async () => {
    withSession(true);
    const response = await call("/projects");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  describe("organisation active (TK-24, G1)", () => {
    const target = async (path: string) => {
      const response = await call(path);
      const location = response.headers.get("location");
      return location ? new URL(location).pathname : null;
    };

    it.each(["/organizations", "/members"])(
      "redirige %s vers /login sans session",
      async (path) => {
        withSession(false);
        expect(await target(path)).toBe("/login");
      },
    );

    it.each(["/projects", "/members"])(
      "redirige %s vers /organizations avec session sans organisation active",
      async (path) => {
        withSession(true, false);
        expect(await target(path)).toBe("/organizations");
      },
    );

    it("laisse passer /organizations avec session sans organisation active (pas de boucle)", async () => {
      withSession(true, false);
      const response = await call("/organizations");
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("laisse passer /members avec session et organisation active", async () => {
      withSession(true, true);
      const response = await call("/members");
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("garde aussi /organizations et /members dans le matcher du proxy", async () => {
      const { config } = await import("../src/proxy.ts");
      expect(config.matcher).toEqual(
        expect.arrayContaining(["/organizations", "/members", "/projects", "/login"]),
      );
    });
  });
});
