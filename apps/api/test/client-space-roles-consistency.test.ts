import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_SPACE_READ_ROLES } from "../src/auth/roles.ts";
import { SpecHeadResolver } from "../src/spec-read/spec-head-resolver.ts";

/**
 * TK-55b : cohérence des constantes de rôles avec le contrôleur `clientSpace`, et extraction du
 * résolveur de tête de spec (refactor actif : une seule définition de la branche de travail et de la
 * résolution, partagée par `spec.*` et `clientSpace.*`).
 */
const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../src", path), "utf8");
const CONTROLLER = "client-space/client-space.controller.ts";

describe("rôles des procédures clientSpace.*", () => {
  it("CLIENT_SPACE_READ_ROLES : les six rôles (le client est cloisonné par projet, pas par rôle)", () => {
    expect([...CLIENT_SPACE_READ_ROLES].sort()).toEqual(
      ["admin", "business", "client", "designer", "dev", "owner"].sort(),
    );
  });

  it.each([
    "projects",
    "features",
    "feature",
    "progress",
    "flows",
    "rules",
    "roles",
    "dataModel",
    "dataFixtures",
    "dataFixtureRows",
  ])("%s : session, garde de rôle et CLIENT_SPACE_READ_ROLES", (name) => {
    const source = read(CONTROLLER);
    const at = source.indexOf(`@Implement(contract.clientSpace.${name})`);
    expect(at, `@Implement(contract.clientSpace.${name}) absent du contrôleur`).toBeGreaterThan(-1);
    const decorators = source.slice(Math.max(0, at - 200), at);
    expect(decorators).toContain("@UseGuards(SessionGuard, RoleGuard)");
    expect(decorators).toContain("@Roles(...CLIENT_SPACE_READ_ROLES)");
  });

  it("aucun rôle nommé en dur, et le cloisonnement central (PROJECT_ACCESS) est injecté", () => {
    const source = read(CONTROLLER);
    expect(source.match(/@Roles\(/g)).toHaveLength(10); // projects, features, feature, puis progress, flows, rules, roles (TK-104), dataModel, dataFixtures, dataFixtureRows (TK-109)
    expect(source).not.toMatch(/@Roles\(\s*"/);
    expect(source).toContain("PROJECT_ACCESS");
  });
});

describe("SpecHeadResolver : extraction du résolveur partagé", () => {
  it("la classe expose resolve()", () => {
    expect(typeof (SpecHeadResolver.prototype as { resolve?: unknown }).resolve).toBe("function");
  });

  it("la branche de travail et la résolution ne vivent plus que dans le résolveur", () => {
    const resolver = read("spec-read/spec-head-resolver.ts");
    const repository = read("spec-read/prisma-spec-read.repository.ts");
    expect(resolver).toContain('"cadrage"');
    expect(repository).not.toContain('"cadrage"');
    expect(repository).not.toMatch(/function resolve\(/);
    expect(repository).toContain("SpecHeadResolver");
  });

  it("le dépôt de l'espace client réutilise le résolveur sans dupliquer la lecture des têtes", () => {
    const repository = read("client-space/prisma-client-space.repository.ts");
    expect(repository).toContain("SpecHeadResolver");
    expect(repository).not.toContain('"cadrage"');
    expect(repository).not.toContain("specHead.findFirst");
  });

  it("le module de lecture de la spec exporte le résolveur", () => {
    const module = read("spec-read/spec-read.module.ts");
    expect(module).toMatch(/exports:\s*\[[^\]]*SpecHeadResolver/);
  });
});
