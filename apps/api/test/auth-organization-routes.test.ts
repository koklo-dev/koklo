import { describe, expect, it } from "vitest";
import { createAuth } from "../src/auth/auth.ts";
import {
  ORGANIZATION_ROUTES,
  OrganizationChannelPolicy,
  parseTarget,
} from "../src/auth/organization-channel.ts";
import type { SessionResolver } from "../src/auth/session.ts";
import { configFor } from "./helpers/app.ts";

/**
 * TK-55 B1-bis : tout chemin `/organization/*` réellement monté par Better Auth (version installée)
 * est classé dans `ORGANIZATION_ROUTES`. Une mise à jour qui ajoute une route fait échouer ce test
 * tant qu'elle n'est pas classée ; en attendant, la table fermée la refuse (fail-closed).
 */
describe("table des routes d'organisation de Better Auth", () => {
  it("classe tous les chemins montés par le plugin", () => {
    const auth = createAuth(
      configFor({ databaseUrl: "postgresql://x:y@127.0.0.1:1/z" }),
      {} as never,
      async () => undefined,
      async () => undefined,
    );
    const mounted = Object.values(auth.api as Record<string, { path?: string }>)
      .map((endpoint) => endpoint.path)
      .filter(
        (path): path is string => typeof path === "string" && path.startsWith("/organization/"),
      )
      .map((path) => path.slice("/organization/".length));
    expect(mounted.length).toBeGreaterThanOrEqual(19);
    const unclassified = mounted.filter((route) => !Object.hasOwn(ORGANIZATION_ROUTES, route));
    expect(unclassified).toEqual([]);
  });

  it("ne classe en `self` que des routes de soi : jamais de liste de membres ni d'écriture", () => {
    const selfRoutes = Object.entries(ORGANIZATION_ROUTES)
      .filter(([, access]) => access === "self")
      .map(([route]) => route)
      .sort();
    expect(selfRoutes).toEqual(
      [
        "accept-invitation",
        "get-active-member",
        "get-active-member-role",
        "get-invitation",
        "has-permission",
        "list",
        "list-user-invitations",
        "list-user-teams",
        "reject-invitation",
        "set-active",
      ].sort(),
    );
  });
});

describe("parseTarget", () => {
  it.each([
    ["/api/auth/organization/list-members", "list-members"],
    ["/api/auth/Organization/LIST-MEMBERS/", "list-members"],
    ["/api/auth//organization//list-members", "list-members"],
    ["/api/auth/x/../organization/list-members", "list-members"],
    ["/api/auth/%2e/organization/list-members", "list-members"],
    ["/api/auth/%6frganization/list-members", "list-members"],
    ["/api/auth/organization/%256cist-members", "list-members"],
    ["/api/auth/organization/nouvelle-route", null],
    ["/api/auth/organization/__proto__", null],
    ["/api/auth/organization/constructor", null],
  ])("%s -> %s", (url, route) => {
    const target = parseTarget(url);
    expect(target.inOrganization).toBe(true);
    expect(target.route).toBe(route);
  });

  it("une URL illisible est traitée comme un chemin d'organisation inconnu", () => {
    const target = parseTarget("/api/auth/organization/%E0%A4%A");
    expect(target).toMatchObject({ inOrganization: true, route: null });
  });

  it("hors espace organisation : non concerné", () => {
    expect(parseTarget("/api/auth/get-session").inOrganization).toBe(false);
    expect(parseTarget("/api/auth/callback/github?code=1").inOrganization).toBe(false);
  });
});

describe("OrganizationChannelPolicy", () => {
  const resolverWith = (role: string | undefined | null): SessionResolver => ({
    resolveUser: async () => (role === null ? null : { userId: "u" }),
    resolve: async () =>
      role === null ? null : { userId: "u", organizationId: "org", ...(role ? { role } : {}) },
  });
  const check = (role: string | undefined | null, method: string, url: string) =>
    new OrganizationChannelPolicy(resolverWith(role)).check(method, url, {});

  it("rôle absent : refusé sur une lecture d'autrui", async () => {
    expect(await check(undefined, "GET", "/api/auth/organization/list-members")).toBe("deny");
  });

  it("méthode autre que GET sur une lecture d'autrui : refusée, même pour owner", async () => {
    expect(await check("owner", "POST", "/api/auth/organization/list-members")).toBe("deny");
  });

  it("owner : lecture d'autrui servie, écriture refusée", async () => {
    expect(await check("owner", "GET", "/api/auth/organization/list-members")).toBe("pass");
    expect(await check("owner", "POST", "/api/auth/organization/update-member-role")).toBe("deny");
  });

  it("organisation désignée autre que l'active : refusée", async () => {
    expect(
      await check("owner", "GET", "/api/auth/organization/list-members?organizationId=autre"),
    ).toBe("deny");
    expect(
      await check("owner", "GET", "/api/auth/organization/list-members?organizationId=org"),
    ).toBe("pass");
  });
});
