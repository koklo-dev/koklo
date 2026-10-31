import { describe, expect, it } from "vitest";
import { guardedPathFor, resolveAccess } from "../src/lib/auth-guard.ts";

/** TK-48 / 48d (R4 de l'analyse) : garde par motif pour `/projects/<projectId>/features`, sans contournement. */
const ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const FEATURES = `/projects/${ID}/features` as const;

describe("guardedPathFor", () => {
  it.each(["/login", "/projects", "/kanban", "/members", "/github", "/organizations"])(
    "chemin exact gardé : %s",
    (path) => {
      expect(guardedPathFor(path)).toBe(path);
    },
  );

  it("la page des fonctionnalités d'un projet est gardée", () => {
    expect(guardedPathFor(FEATURES)).toBe(FEATURES);
  });

  it("un identifiant qui n'est pas un uuid est gardé aussi (la page répond « Projet introuvable »)", () => {
    expect(guardedPathFor("/projects/pas-un-uuid/features")).toBe("/projects/pas-un-uuid/features");
  });

  it.each([
    `/projects/${ID}`,
    `/projects/${ID}/`,
    `/projects/${ID}/features/`,
    `/projects/${ID}/features/x`,
    `/projects/${ID}/features/F-001`,
    `/projects/${ID}/other`,
    "/projects//features",
    "/projects/a/b/features",
    "/projects/features",
    "/projects/",
    "/projectsx",
    "/api/orpc/projects",
    `/admin/projects/${ID}/features`,
    "/inconnu",
    "",
  ])("chemin voisin ou inexistant non traité comme gardé : %s", (path) => {
    expect(guardedPathFor(path)).toBeNull();
  });
});

describe("resolveAccess — /projects/<id>/features", () => {
  it("sans session : /login", () => {
    expect(resolveAccess({ path: FEATURES, hasSession: false })).toBe("/login");
  });

  it("sans session, même sans organisation active : /login", () => {
    expect(resolveAccess({ path: FEATURES, hasSession: false, hasActiveOrganization: false })).toBe(
      "/login",
    );
  });

  it("session sans organisation active : /organizations (jamais /login)", () => {
    expect(resolveAccess({ path: FEATURES, hasSession: true, hasActiveOrganization: false })).toBe(
      "/organizations",
    );
  });

  it("session et organisation active : accès permis", () => {
    expect(
      resolveAccess({ path: FEATURES, hasSession: true, hasActiveOrganization: true }),
    ).toBeNull();
  });

  it("organisation inconnue (absente) : on ne renvoie pas vers /organizations", () => {
    expect(resolveAccess({ path: FEATURES, hasSession: true })).toBeNull();
  });
});
