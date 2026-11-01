import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MANAGER_ROLES, PROJECT_CLIENT_ROLES, SPEC_READ_ROLES } from "../src/auth/roles.ts";

/**
 * TK-55a : cohérence entre les constantes de rôles et les contrôleurs. `projectClient.*` relève
 * des gestionnaires ; `spec.*` est fermé au client (D7). Le garde de rôle précède le cloisonnement
 * par projet : un rôle interdit reçoit 403, jamais un 404 révélateur.
 */
const read = (path: string) => readFileSync(resolve(import.meta.dirname, "../src", path), "utf8");

describe("rôles des procédures projectClient.*", () => {
  const CONTROLLER = "project-client/project-client.controller.ts";

  it("PROJECT_CLIENT_ROLES : owner et admin", () => {
    expect([...PROJECT_CLIENT_ROLES].sort()).toEqual(["admin", "owner"]);
    expect([...PROJECT_CLIENT_ROLES]).toEqual([...MANAGER_ROLES]);
  });

  it.each(["list", "add", "remove"])(
    "%s : session, garde de rôle et PROJECT_CLIENT_ROLES",
    (name) => {
      const source = read(CONTROLLER);
      const at = source.indexOf(`@Implement(contract.projectClient.${name})`);
      expect(at, `@Implement(contract.projectClient.${name}) absent du contrôleur`).toBeGreaterThan(
        -1,
      );
      const decorators = source.slice(Math.max(0, at - 200), at);
      expect(decorators).toContain("@UseGuards(SessionGuard, RoleGuard)");
      expect(decorators).toContain("@Roles(...PROJECT_CLIENT_ROLES)");
    },
  );

  it("aucun rôle nommé en dur", () => {
    const source = read(CONTROLLER);
    expect(source.match(/@Roles\(/g)).toHaveLength(3);
    expect(source).not.toMatch(/@Roles\(\s*"/);
  });
});

describe("rôles des procédures spec.* de lecture (D7)", () => {
  const CONTROLLER = "spec-read/spec-read.controller.ts";

  it("SPEC_READ_ROLES exclut le client", () => {
    expect(SPEC_READ_ROLES as readonly string[]).not.toContain("client");
  });

  it.each(["head", "listFeatures", "getFeature"])(
    "%s : session, garde de rôle et SPEC_READ_ROLES",
    (name) => {
      const source = read(CONTROLLER);
      const at = source.indexOf(`@Implement(contract.spec.${name})`);
      expect(at, `@Implement(contract.spec.${name}) absent du contrôleur`).toBeGreaterThan(-1);
      const decorators = source.slice(Math.max(0, at - 200), at);
      expect(decorators).toContain("@UseGuards(SessionGuard, RoleGuard)");
      expect(decorators).toContain("@Roles(...SPEC_READ_ROLES)");
    },
  );
});
