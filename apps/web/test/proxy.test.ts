import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../src/proxy.ts";

const hasSession = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session.ts", () => ({ hasSession }));

beforeEach(() => {
  vi.stubEnv("API_URL", "http://api.internal:3001");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("APP_VERSION", "0.0.0");
  hasSession.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

const call = (path: string) => proxy(new NextRequest(`http://web.test${path}`));

describe("proxy", () => {
  it("relaie /api/auth/* vers l'API en conservant la query", async () => {
    const response = await call("/api/auth/sign-in/social?x=1");
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://api.internal:3001/api/auth/sign-in/social?x=1",
    );
    expect(hasSession).not.toHaveBeenCalled();
  });

  it("relaie /api/orpc/* vers l'API sans le préfixe", async () => {
    const response = await call("/api/orpc/projects");
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://api.internal:3001/projects");
  });

  it("redirige /projects vers /login sans session", async () => {
    hasSession.mockResolvedValue(false);
    const response = await call("/projects");
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it("redirige /login vers /projects avec session", async () => {
    hasSession.mockResolvedValue(true);
    const response = await call("/login");
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/projects");
  });

  it("laisse passer /projects avec session", async () => {
    hasSession.mockResolvedValue(true);
    const response = await call("/projects");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
