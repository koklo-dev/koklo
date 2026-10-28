import * as db from "@koklo/db";
import { describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.module.ts";
import { PrismaProjectRepository } from "./prisma-project.repository.ts";

const ORG = "01900000-0000-7000-8000-0000000000a1";

/** Faux client : enregistre l'organisation du contexte au moment où `findMany` est appelé. */
function recordingDatabase() {
  const seen: (string | undefined)[] = [];
  const database = {
    client: {
      project: {
        findMany: async () => {
          seen.push(db.currentOrganizationId());
          return [];
        },
      },
    },
  } as unknown as DatabaseService;
  return { database, seen };
}

describe("PrismaProjectRepository : passage par le contexte multi-tenant (TK-20)", () => {
  it("listByOrganization exécute la requête dans withOrganization(organizationId)", async () => {
    const { database, seen } = recordingDatabase();

    await new PrismaProjectRepository(database).listByOrganization(ORG);

    expect(seen).toEqual([ORG]);
  });
});
