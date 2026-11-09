import { describe, expect, it } from "vitest";
import { guardedPathFor, resolveAccess } from "../src/lib/auth-guard.ts";
import { legacyRedirect } from "../src/lib/legacy-routes.ts";

/** TK-88 (C1, C2) : les routes de la coquille sont gardées, les anciens chemins sont redirigés. */
const ID = "7d1f6c1e-0b0a-4c55-9d63-1d2f7d6a1b01";
const SPEC_SLUGS = [
  "functional",
  "data",
  "architecture",
  "technical",
  "security",
  "design",
  "quality",
];

describe("guardedPathFor — routes de la coquille", () => {
  it.each([
    `/projects/${ID}`,
    `/projects/${ID}/idea`,
    `/projects/${ID}/framing`,
    `/projects/${ID}/tickets`,
    `/projects/${ID}/activity`,
    `/projects/${ID}/features`,
    ...SPEC_SLUGS.map((slug) => `/projects/${ID}/spec/${slug}`),
    "/settings",
    "/settings/general",
    "/settings/members",
    "/settings/github",
    "/settings/ai",
    "/settings/account",
    "/kanban",
    "/members",
    "/github",
  ])("%s est gardé", (path) => {
    expect(guardedPathFor(path)).toBe(path);
  });

  it.each([
    `/projects/${ID}/`,
    `/projects/${ID}/spec`,
    `/projects/${ID}/spec/`,
    `/projects/${ID}/spec/inconnu`,
    `/projects/${ID}/spec/functional/x`,
    `/projects/${ID}/tickets/TK-1`,
    `/projects/${ID}/idea/x`,
    `/projects/${ID}/other`,
    "/settings/",
    "/settings/inconnu",
    "/settings/ai/x",
    "/settingsx",
  ])("%s n'est pas gardé (404 Next, jamais une redirection vers une page protégée)", (path) => {
    expect(guardedPathFor(path)).toBeNull();
  });
});

describe("resolveAccess — pages de la coquille", () => {
  it.each([`/projects/${ID}/tickets`, "/settings/ai", `/projects/${ID}/spec/data`] as const)(
    "%s : /login sans session, /organizations sans organisation, sinon laisse passer",
    (path) => {
      expect(resolveAccess({ path, hasSession: false })).toBe("/login");
      expect(resolveAccess({ path, hasSession: true, hasActiveOrganization: false })).toBe(
        "/organizations",
      );
      expect(resolveAccess({ path, hasSession: true, hasActiveOrganization: true })).toBeNull();
    },
  );
});

describe("legacyRedirect — anciens chemins (B78)", () => {
  it("/projects/<id>/features conserve toute la requête et ajoute tab=features", () => {
    expect(legacyRedirect(`/projects/${ID}/features`, "?q=a%20b&sel=F-001&status=draft")).toBe(
      `/projects/${ID}/spec/functional?tab=features&q=a+b&sel=F-001&status=draft`,
    );
  });

  it("/projects/<id>/features sans requête", () => {
    expect(legacyRedirect(`/projects/${ID}/features`, "")).toBe(
      `/projects/${ID}/spec/functional?tab=features`,
    );
  });

  it("un tab venu de l'ancien lien est remplacé par features", () => {
    expect(legacyRedirect(`/projects/${ID}/features`, "?tab=rules&q=x")).toBe(
      `/projects/${ID}/spec/functional?tab=features&q=x`,
    );
  });

  it("/members et /github conservent la requête", () => {
    expect(legacyRedirect("/members", "")).toBe("/settings/members");
    expect(legacyRedirect("/github", "?result=installed")).toBe(
      "/settings/github?result=installed",
    );
  });

  it.each(["/settings/ai", "/kanban", "/projects", `/projects/${ID}`, `/projects/${ID}/tickets`])(
    "%s ne redirige pas",
    (path) => {
      expect(legacyRedirect(path, "?x=1")).toBeNull();
    },
  );
});
