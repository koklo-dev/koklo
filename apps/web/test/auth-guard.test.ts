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

describe("resolveAccess — organisation active (TK-24, G1)", () => {
  const session = { hasSession: true };

  it("redirige /projects vers /organizations avec session sans organisation active", () => {
    expect(resolveAccess({ path: "/projects", ...session, hasActiveOrganization: false })).toBe(
      "/organizations",
    );
  });

  it("redirige /members vers /organizations avec session sans organisation active", () => {
    expect(resolveAccess({ path: "/members", ...session, hasActiveOrganization: false })).toBe(
      "/organizations",
    );
  });

  it.each(["/projects", "/members", "/organizations"] as const)(
    "redirige %s vers /login sans session",
    (path) => {
      expect(resolveAccess({ path, hasSession: false, hasActiveOrganization: false })).toBe(
        "/login",
      );
    },
  );

  it.each(["/projects", "/members"] as const)(
    "laisse passer %s avec session et organisation active",
    (path) => {
      expect(resolveAccess({ path, ...session, hasActiveOrganization: true })).toBeNull();
    },
  );

  it.each([true, false])(
    "ne renvoie jamais /organizations vers /login quand une session existe (active=%s)",
    (hasActiveOrganization) => {
      expect(
        resolveAccess({ path: "/organizations", ...session, hasActiveOrganization }),
      ).toBeNull();
    },
  );

  it("n'entre jamais dans une boucle /login <-> /projects pour une session sans organisation", () => {
    const visited: string[] = [];
    let path: "/login" | "/projects" | "/members" | "/organizations" = "/login";
    for (let hop = 0; hop < 6; hop++) {
      visited.push(path);
      const next = resolveAccess({ path, hasSession: true, hasActiveOrganization: false });
      if (!next) break;
      path = next;
    }
    expect(visited.at(-1)).toBe("/organizations");
    expect(visited.filter((p) => p === "/login")).toHaveLength(1);
    expect(visited.length).toBeLessThan(6);
  });
});

describe("redirectForError — UNAUTHORIZED avec session (TK-24, G1)", () => {
  it("renvoie /organizations quand la session existe encore", () => {
    expect(redirectForError({ code: "UNAUTHORIZED" }, { hasSession: true })).toBe("/organizations");
  });

  it("renvoie /login quand la session est perdue", () => {
    expect(redirectForError({ code: "UNAUTHORIZED" }, { hasSession: false })).toBe("/login");
  });

  it("ne redirige pas pour une autre erreur, session ou non", () => {
    expect(redirectForError({ code: "INTERNAL" }, { hasSession: true })).toBeNull();
    expect(redirectForError({ code: "FORBIDDEN" }, { hasSession: false })).toBeNull();
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

describe("resolveAccess — /github (TK-48b)", () => {
  it("redirige /github vers /login sans session", () => {
    expect(resolveAccess({ path: "/github", hasSession: false })).toBe("/login");
  });

  it("redirige /github vers /organizations avec session sans organisation active", () => {
    expect(resolveAccess({ path: "/github", hasSession: true, hasActiveOrganization: false })).toBe(
      "/organizations",
    );
  });

  it("laisse passer /github avec session et organisation active", () => {
    expect(
      resolveAccess({ path: "/github", hasSession: true, hasActiveOrganization: true }),
    ).toBeNull();
  });
});
