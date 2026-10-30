import { roleSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import {
  canSeeWorktree,
  LEASE_ACQUIRE_ROLES,
  PROJECT_STATE_READ_ROLES,
  PROJECT_STATE_WRITE_ROLES,
  TICKET_WRITE_ROLES,
} from "../src/auth/roles.ts";

const sorted = (roles: readonly string[]) => [...roles].sort();

describe("rôles des baux et de l'état de projet (CDC §14)", () => {
  it("LEASE_ACQUIRE_ROLES : owner, admin et dev", () => {
    expect(sorted(LEASE_ACQUIRE_ROLES)).toEqual(["admin", "dev", "owner"]);
  });

  it("PROJECT_STATE_READ_ROLES : owner, admin et dev", () => {
    expect(sorted(PROJECT_STATE_READ_ROLES)).toEqual(["admin", "dev", "owner"]);
  });

  it("PROJECT_STATE_WRITE_ROLES : owner et admin", () => {
    expect(sorted(PROJECT_STATE_WRITE_ROLES)).toEqual(["admin", "owner"]);
  });

  it("n'accordent rien à client ni business et ne nomment que des rôles du contrat", () => {
    for (const roles of [
      LEASE_ACQUIRE_ROLES,
      PROJECT_STATE_READ_ROLES,
      PROJECT_STATE_WRITE_ROLES,
    ]) {
      expect(roles).not.toContain("client");
      expect(roles).not.toContain("business");
      for (const role of roles) {
        expect(roleSchema.options).toContain(role);
      }
    }
  });

  it("l'écriture de l'état est incluse dans sa lecture, la prise de bail dans l'écriture tickets", () => {
    for (const role of PROJECT_STATE_WRITE_ROLES) {
      expect(PROJECT_STATE_READ_ROLES).toContain(role);
    }
    for (const role of LEASE_ACQUIRE_ROLES) {
      expect(TICKET_WRITE_ROLES).toContain(role);
    }
  });
});

describe("canSeeWorktree : le worktree n'est visible que des rôles d'écriture", () => {
  it("accepte les rôles de TICKET_WRITE_ROLES", () => {
    for (const role of TICKET_WRITE_ROLES) {
      expect(canSeeWorktree(role)).toBe(true);
    }
  });

  it("refuse client, business, rôle inconnu et absence de rôle", () => {
    for (const role of ["client", "business", "intrus", undefined]) {
      expect(canSeeWorktree(role)).toBe(false);
    }
  });
});
