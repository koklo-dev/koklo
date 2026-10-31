import { roleSchema } from "@koklo/contract";
import { describe, expect, it } from "vitest";
import { MANAGER_ROLES, SPEC_BATCH_ROLES, TICKET_WRITE_ROLES } from "../src/auth/roles.ts";
import { loadConfig } from "../src/config.ts";

/** TK-44b : SPEC_BATCH_WAIT_MS (défaut 8 s) et matrice de rôles de specBatch.*. */
const ENV = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  BETTER_AUTH_SECRET: "s".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
};

describe("SPEC_BATCH_WAIT_MS", () => {
  it("valeur fournie : lue en millisecondes", async () => {
    expect(loadConfig({ ...ENV, SPEC_BATCH_WAIT_MS: "2500" }).specBatchWaitMs).toBe(2500);
  });

  it("absente : défaut de 8 s (constante exportée, sondage toutes les 150 ms)", async () => {
    const wait = await import("../src/spec-batch/wait.ts");
    expect(wait.SPEC_BATCH_WAIT_DEFAULT_MS).toBe(8000);
    expect(wait.SPEC_BATCH_POLL_MS).toBe(150);
    expect(loadConfig(ENV).specBatchWaitMs ?? wait.SPEC_BATCH_WAIT_DEFAULT_MS).toBe(8000);
  });

  it.each(["abc", "0", "-5", "1.5", "99999999"])(
    "valeur %j : échec au démarrage qui nomme la variable sans citer la valeur",
    (value) => {
      let message = "";
      try {
        loadConfig({ ...ENV, SPEC_BATCH_WAIT_MS: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("SPEC_BATCH_WAIT_MS");
      if (value.length > 2) expect(message).not.toContain(value);
    },
  );
});

describe("rôles des procédures specBatch.*", () => {
  const sorted = (roles: readonly string[]) => [...roles].sort();

  it("SPEC_BATCH_ROLES : owner, admin, dev et designer (le designer est limité par opération)", () => {
    expect(sorted(SPEC_BATCH_ROLES)).toEqual(["admin", "designer", "dev", "owner"]);
  });

  it("client et business n'y figurent jamais ; ce sont des rôles du contrat, dans les rôles d'écriture du tracker", () => {
    expect(SPEC_BATCH_ROLES).not.toContain("client");
    expect(SPEC_BATCH_ROLES).not.toContain("business");
    for (const role of SPEC_BATCH_ROLES) {
      expect(roleSchema.options).toContain(role);
      expect(TICKET_WRITE_ROLES).toContain(role);
    }
    for (const role of MANAGER_ROLES) expect(SPEC_BATCH_ROLES).toContain(role);
  });
});
