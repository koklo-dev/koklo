import { roleSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { MANAGER_ROLES, REPO_READ_ROLES, TICKET_WRITE_ROLES } from "../src/auth/roles.ts";

const sorted = (roles: readonly string[]) => [...roles].sort();

/** TK-43 : matrice de rôles de docs/api-contract.md (CDC §14) pour les procédures repo.*. */
describe("rôles des procédures repo.*", () => {
  it("REPO_READ_ROLES : owner, admin, dev et designer (repo.list)", () => {
    expect(sorted(REPO_READ_ROLES)).toEqual(["admin", "designer", "dev", "owner"]);
  });

  it("repo.createSpec et repo.link relèvent des gestionnaires : owner et admin", () => {
    expect(sorted(MANAGER_ROLES)).toEqual(["admin", "owner"]);
  });

  it("client et business n'ont aucun accès aux dépôts, et seuls des rôles du contrat sont nommés", () => {
    for (const roles of [REPO_READ_ROLES, MANAGER_ROLES]) {
      expect(roles).not.toContain("client");
      expect(roles).not.toContain("business");
      for (const role of roles) expect(roleSchema.options).toContain(role);
    }
  });

  it("la gestion est incluse dans la lecture, qui reste dans les rôles d'écriture du tracker", () => {
    for (const role of MANAGER_ROLES) expect(REPO_READ_ROLES).toContain(role);
    for (const role of REPO_READ_ROLES) expect(TICKET_WRITE_ROLES).toContain(role);
  });
});
