import { roleSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import {
  AUDIT_READ_ROLES,
  COMMENT_DELETE_ANY_ROLES,
  COMMENT_WRITE_ROLES,
  MANAGER_ROLES,
  TICKET_WRITE_ROLES,
} from "../src/auth/roles.ts";

/** TK-32 : sources uniques des rôles de commentaires et du journal (CDC §14). */
describe("COMMENT_WRITE_ROLES", () => {
  it("contient exactement owner, admin, dev, designer et client (le client commente)", () => {
    expect([...(COMMENT_WRITE_ROLES ?? [])].sort()).toEqual([
      "admin",
      "client",
      "designer",
      "dev",
      "owner",
    ]);
  });

  it("exclut business, nomme des rôles du contrat et contient tous les rôles d'écriture de tickets", () => {
    expect(COMMENT_WRITE_ROLES).not.toContain("business");
    for (const role of COMMENT_WRITE_ROLES ?? []) {
      expect(roleSchema.options).toContain(role);
    }
    for (const role of TICKET_WRITE_ROLES) {
      expect(COMMENT_WRITE_ROLES).toContain(role);
    }
  });
});

describe("COMMENT_DELETE_ANY_ROLES", () => {
  it("contient exactement owner et admin (modération de tout commentaire)", () => {
    expect([...(COMMENT_DELETE_ANY_ROLES ?? [])].sort()).toEqual(["admin", "owner"]);
  });
});

describe("AUDIT_READ_ROLES", () => {
  it("est exactement MANAGER_ROLES : le journal est lu par owner et admin seulement", () => {
    expect([...(AUDIT_READ_ROLES ?? [])].sort()).toEqual([...MANAGER_ROLES].sort());
  });
});
