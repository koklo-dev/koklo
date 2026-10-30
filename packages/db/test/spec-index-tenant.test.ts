import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertFullTree, SPEC_MODELS } from "./support/spec-fixtures.ts";
import { insertScope, type Scope } from "./support/ticket-fixtures.ts";

const {
  createDbClient,
  createRawDbClient,
  withOrganization,
  TENANT_MODELS,
  TENANT_EXCLUDED_MODELS,
} = dbPackage;

interface Delegate {
  findMany: (args?: unknown) => Promise<{ id: string; organizationId: string }[]>;
  findFirst: (args?: unknown) => Promise<{ id: string } | null>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<{ id: string; organizationId: string }>;
}
/** Les modèles TK-41 n'existent pas encore dans le client généré : délégués typés à la main. */
type SpecClient = Record<
  "providerInstallation" | "projectRepo" | "specSnapshot" | "specWriteBatch" | "webhookDelivery",
  Delegate
>;

let database: TestDatabase;
let raw: ReturnType<typeof createRawDbClient> & SpecClient;
let tenant: ReturnType<typeof createDbClient> & SpecClient;
let a: Scope;
let b: Scope;
let treeA: Awaited<ReturnType<typeof insertFullTree>>;
let treeB: Awaited<ReturnType<typeof insertFullTree>>;

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await insertScope(database, "spec-a");
  b = await insertScope(database, "spec-b");
  treeA = await insertFullTree(database, a);
  treeB = await insertFullTree(database, b);
  raw = createRawDbClient(database.url) as never;
  tenant = createDbClient(database.url) as never;
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await raw?.$disconnect();
  await database?.dispose();
}, 60_000);

describe("TK-41 C9 isolation multi-tenant de l'index de spec", () => {
  it("les 12 modèles sont dans TENANT_MODELS, hors exclusions", () => {
    for (const model of SPEC_MODELS) {
      expect([...TENANT_MODELS], model).toContain(model);
      expect(TENANT_EXCLUDED_MODELS).not.toHaveProperty(model);
    }
  });

  it("WebhookDelivery est exclu avec une raison explicite et n'est pas un modèle métier", () => {
    expect([...TENANT_MODELS]).not.toContain("WebhookDelivery");
    expect(TENANT_EXCLUDED_MODELS).toHaveProperty("WebhookDelivery");
    expect(TENANT_EXCLUDED_MODELS.WebhookDelivery?.trim().length).toBeGreaterThan(10);
  });

  it("sous withOrganization(A), installations, repos, snapshots et lots de B sont invisibles", async () => {
    const seen = async (delegate: keyof SpecClient) =>
      (await withOrganization(a.organizationId, () => tenant[delegate].findMany())).map(
        (r) => r.id,
      );

    expect(await seen("providerInstallation")).toEqual([treeA.installationId]);
    expect(await seen("projectRepo")).toEqual([treeA.repoId]);
    expect(await seen("specSnapshot")).toEqual([treeA.snapshotId]);
    expect(await seen("specWriteBatch")).toEqual([treeA.batchId]);
    const foreign = await withOrganization(a.organizationId, () =>
      tenant.projectRepo.findFirst({ where: { id: treeB.repoId } }),
    );
    expect(foreign).toBeNull();
    expect(await withOrganization(b.organizationId, () => tenant.specSnapshot.count())).toBe(1);
  });
});

describe("TK-41 C9 isolation multi-tenant de l'index de spec : écriture et client brut", () => {
  it("create sans organizationId affecte l'organisation du contexte", async () => {
    const created = await withOrganization(a.organizationId, () =>
      tenant.providerInstallation.create({
        data: {
          provider: "github",
          externalId: `ext-${randomUUID()}`,
          ownerKind: "organization",
          ownerLogin: "acme",
          status: "active",
        },
      }),
    );

    expect(created.organizationId).toBe(a.organizationId);
  });

  it("sans contexte d'organisation, l'accès est refusé", async () => {
    await expect(tenant.specSnapshot.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
  });

  it("l'identifiant d'un lot créé par Prisma est un UUID v7 (valeur du trailer Koklo-Ops:)", async () => {
    const batch = await raw.specWriteBatch.findFirst({ where: { id: treeA.batchId } });
    expect(batch).not.toBeNull();
    const created = await raw.providerInstallation.create({
      data: {
        organizationId: a.organizationId,
        provider: "github",
        externalId: `v7-${randomUUID()}`,
        ownerKind: "user",
        ownerLogin: "me",
        status: "active",
      },
    });
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("WebhookDelivery est lisible via le client brut, sans organisation", async () => {
    await database.query(
      `INSERT INTO webhook_deliveries (id, provider, delivery_id, event, payload, status, attempts,
         received_at, created_at, updated_at)
       VALUES ($1, 'github', 'raw-1', 'push', '{}'::jsonb, 'received', 0, now(), now(), now())`,
      [randomUUID()],
    );

    const rows = await raw.webhookDelivery.findMany({ where: { deliveryId: "raw-1" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("organizationId");
  });
});
