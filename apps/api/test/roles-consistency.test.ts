import { memberRoleSchema, roleSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { MANAGER_ROLES, organizationRoles } from "../src/auth/roles.ts";

type Statements = { invitation?: readonly string[] };

describe("matrice de rôles : une seule source", () => {
  it("les rôles du plugin sont ceux du contrat", () => {
    expect(Object.keys(organizationRoles).sort()).toEqual([...roleSchema.options].sort());
    expect(memberRoleSchema.options).not.toContain("owner");
  });

  it("les rôles de gestion sont exactement ceux qui ont le droit d'inviter dans le plugin", () => {
    const mayInvite = Object.entries(organizationRoles)
      .filter(([, role]) => (role.statements as Statements).invitation?.includes("create"))
      .map(([name]) => name);
    expect([...MANAGER_ROLES].sort()).toEqual(mayInvite.sort());
  });
});
