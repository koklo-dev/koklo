import { describe, expect, it } from "vitest";
import { redirectForError, resolveAccess } from "../src/lib/auth-guard.ts";

describe("resolveAccess", () => {
  it("redirige /projects vers /login sans session", () => {
    expect(resolveAccess({ path: "/projects", hasSession: false })).toBe("/login");
  });

  it("redirige /login vers /projects avec session", () => {
    expect(resolveAccess({ path: "/login", hasSession: true })).toBe("/projects");
  });

  it("ne redirige pas /projects avec session", () => {
    expect(resolveAccess({ path: "/projects", hasSession: true })).toBeNull();
  });

  it("ne redirige pas /login sans session", () => {
    expect(resolveAccess({ path: "/login", hasSession: false })).toBeNull();
  });
});

describe("redirectForError", () => {
  it("renvoie /login pour une erreur UNAUTHORIZED", () => {
    expect(redirectForError({ code: "UNAUTHORIZED" })).toBe("/login");
  });

  it("ne redirige pas pour une erreur INTERNAL (elle s'affiche dans la liste)", () => {
    expect(redirectForError({ code: "INTERNAL" })).toBeNull();
  });

  it("ne redirige pas pour une erreur réseau sans code", () => {
    expect(redirectForError(new TypeError("fetch failed"))).toBeNull();
  });
});
