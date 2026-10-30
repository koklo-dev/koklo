import { roleSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { TICKET_WRITE_ROLES } from "../src/auth/roles.ts";

describe("TICKET_WRITE_ROLES : source unique des écritures tickets et sprints (CDC §14)", () => {
  it("contient exactement owner, admin, dev et designer", () => {
    expect([...TICKET_WRITE_ROLES].sort()).toEqual(["admin", "designer", "dev", "owner"]);
  });

  it("exclut client et business, et ne nomme que des rôles du contrat", () => {
    expect(TICKET_WRITE_ROLES).not.toContain("client");
    expect(TICKET_WRITE_ROLES).not.toContain("business");
    for (const role of TICKET_WRITE_ROLES) {
      expect(roleSchema.options).toContain(role);
    }
  });
});
