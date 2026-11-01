import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { roleSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { MANAGER_ROLES } from "../src/auth/roles.ts";

/**
 * TK-52b : cohérence entre la matrice de docs/api-contract.md (CDC §14) et le contrôleur. Les
 * cinq procédures (verify : 0.9.0) relèvent des gestionnaires (owner, admin), jamais d'un rôle ouvert.
 */
const CONTROLLER = resolve(
  import.meta.dirname,
  "../src/llm-credential/llm-credential.controller.ts",
);
const PROCEDURES = ["list", "set", "remove", "invalidate", "verify"];

describe("rôles des procédures llmCredential.*", () => {
  it("MANAGER_ROLES : owner et admin, rôles du contrat", () => {
    expect([...MANAGER_ROLES].sort()).toEqual(["admin", "owner"]);
    for (const role of MANAGER_ROLES) expect(roleSchema.options).toContain(role);
  });

  it.each(PROCEDURES)(
    "%s : session, garde de rôle et MANAGER_ROLES, devant l'implémentation",
    (name) => {
      const source = readFileSync(CONTROLLER, "utf8");
      const at = source.indexOf(`@Implement(contract.llmCredential.${name})`);
      expect(at, `@Implement(contract.llmCredential.${name}) absent du contrôleur`).toBeGreaterThan(
        -1,
      );
      const decorators = source.slice(Math.max(0, at - 200), at);
      expect(decorators).toContain("@UseGuards(SessionGuard, RoleGuard)");
      expect(decorators).toContain("@Roles(...MANAGER_ROLES)");
    },
  );

  it("aucune procédure du contrôleur n'est ouverte à un rôle nommé en dur", () => {
    const source = readFileSync(CONTROLLER, "utf8");
    expect(source.match(/@Roles\(/g)).toHaveLength(PROCEDURES.length);
    expect(source).not.toMatch(/@Roles\(\s*"/);
  });
});
