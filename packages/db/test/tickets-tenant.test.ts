import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertScope, insertTicket, type Scope, TICKET_MODELS } from "./support/ticket-fixtures.ts";

const { createDbClient, createRawDbClient, withOrganization, TENANT_MODELS } = dbPackage;

/** Délégué Prisma minimal : les modèles du ticket n'existent pas encore dans le client généré. */
interface TicketDelegate {
  findMany: (args?: unknown) => Promise<{ id: string; organizationId: string; key: string }[]>;
  findFirst: (args?: unknown) => Promise<{ id: string } | null>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<{ id: string; organizationId: string }>;
}
type TicketClient = { ticket: TicketDelegate };

let database: TestDatabase;
let raw: ReturnType<typeof createRawDbClient>;
let tenant: TicketClient & ReturnType<typeof createDbClient>;
let a: Scope;
let b: Scope;
let ticketA: string;
let ticketB: string;

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await insertScope(database, "tenant-a");
  b = await insertScope(database, "tenant-b");
  ticketA = await insertTicket(database, a, { key: "TK-1" });
  ticketB = await insertTicket(database, b, { key: "TK-1" });
  raw = createRawDbClient(database.url);
  tenant = createDbClient(database.url) as never;
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await raw?.$disconnect();
  await database?.dispose();
}, 60_000);

describe("TK-28 C9 isolation multi-tenant des tickets", () => {
  it("les 11 modèles du ticket sont dans TENANT_MODELS, sans exclusion nouvelle", () => {
    for (const model of TICKET_MODELS) {
      expect([...TENANT_MODELS], model).toContain(model);
      expect(dbPackage.TENANT_EXCLUDED_MODELS).not.toHaveProperty(model);
    }
  });

  it("sous withOrganization(A), le ticket de B est invisible", async () => {
    const listed = await withOrganization(a.organizationId, () => tenant.ticket.findMany());
    const foreign = await withOrganization(a.organizationId, () =>
      tenant.ticket.findFirst({ where: { id: ticketB } }),
    );

    expect(listed.map((t) => t.id)).toEqual([ticketA]);
    expect(foreign).toBeNull();
    expect(await withOrganization(b.organizationId, () => tenant.ticket.count())).toBe(1);
  });

  it("create sans organizationId affecte l'organisation du contexte", async () => {
    const created = await withOrganization(a.organizationId, () =>
      tenant.ticket.create({
        data: {
          projectId: a.projectId,
          key: "TK-2",
          title: "Créé sous A",
          description: "",
          type: "task",
          status: "todo",
          priority: "medium",
          pkg: "db",
          sensitivity: "safe",
        },
      }),
    );

    expect(created.organizationId).toBe(a.organizationId);
  });

  it("sans contexte d'organisation, l'accès aux tickets est refusé", async () => {
    await expect(tenant.ticket.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
  });
});
