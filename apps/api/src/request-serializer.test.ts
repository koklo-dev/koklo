import { describe, expect, it } from "vitest";
import { pathOnly, serializeRequest } from "./request-serializer.ts";

describe("serializeRequest (TK-22 : pas de jeton dans le journal de requêtes)", () => {
  it("réduit l'URL à son chemin et écarte query, params et raw", () => {
    const serialized = serializeRequest({
      id: "req-1",
      method: "GET",
      url: "/api/auth/magic-link/verify?token=secret&callbackURL=%2F",
      headers: { host: "x" },
      remoteAddress: "127.0.0.1",
      remotePort: 1234,
      query: { token: "secret" },
      raw: {},
    } as Parameters<typeof serializeRequest>[0]);
    expect(serialized).toEqual({
      id: "req-1",
      method: "GET",
      url: "/api/auth/magic-link/verify",
      headers: { host: "x" },
      remoteAddress: "127.0.0.1",
      remotePort: 1234,
    });
    expect(JSON.stringify(serialized)).not.toContain("secret");
  });

  it("pathOnly retire aussi le fragment et laisse une valeur non texte telle quelle", () => {
    expect(pathOnly("/a/b#frag?x=1")).toBe("/a/b");
    expect(pathOnly(undefined)).toBeUndefined();
  });
});
