import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertProjectClient,
  PROJECT_CLIENT_MODELS,
  type ProjectClientScope,
  projectClientScope,
} from "./support/project-client-fixtures.ts";

const {
  createDbClient,
  createRawDbClient,
  withOrganization,
  TENANT_MODELS,
  TENANT_EXCLUDED_MODELS,
} = dbPackage;

/** Le modèle de TK-55a n'existe pas encore dans le client généré : délégué typé à la main. */
interface Row {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
}
interface Delegate {
  findMany: (args?: unknown) => Promise<Row[]>;
  findFirst: (args?: unknown) => Promise<Row | null>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<Row>;
  createMany: (args: unknown) => Promise<{ count: number }>;
  update: (args: unknown) => Promise<Row>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  delete: (args: unknown) => Promise<Row>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
}
type Client = Record<"projectClientAccess", Delegate>;

let database: TestDatabase;
let tenant: ReturnType<typeof createDbClient> & Client;
let raw: ReturnType<typeof createRawDbClient> & Client;
let a: ProjectClientScope;
let b: ProjectClientScope;
const ids = { a: "", b: "" };

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await projectClientScope(database, "pc-tenant-a");
  b = await projectClientScope(database, "pc-tenant-b");
  ids.a = await insertProjectClient(database, a);
  ids.b = await insertProjectClient(database, b);
  tenant = createDbClient(database.url) as never;
  raw = createRawDbClient(database.url) as never;
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await raw?.$disconnect();
  await database?.dispose();
}, 60_000);

const data = (scope: ProjectClientScope, extra: Record<string, unknown> = {}) => ({
  projectId: scope.projectId,
  userId: scope.userId,
  ...extra,
});

describe("TK-55a : modèle multi-tenant", () => {
  it("ProjectClientAccess est dans TENANT_MODELS, hors exclusions", () => {
    for (const model of PROJECT_CLIENT_MODELS) {
      expect([...TENANT_MODELS], model).toContain(model);
      expect(TENANT_EXCLUDED_MODELS).not.toHaveProperty(model);
    }
  });

  it("sous withOrganization(A), les liens de B sont invisibles, et inversement", async () => {
    const seen = async (org: string) =>
      (await withOrganization(org, () => tenant.projectClientAccess.findMany())).map((r) => r.id);
    expect(await seen(a.organizationId)).toContain(ids.a);
    expect(await seen(a.organizationId)).not.toContain(ids.b);
    expect(await seen(b.organizationId)).toContain(ids.b);
    expect(await seen(b.organizationId)).not.toContain(ids.a);
    expect(
      await withOrganization(a.organizationId, () =>
        tenant.projectClientAccess.findFirst({ where: { id: ids.b } }),
      ),
    ).toBeNull();
    expect(
      await withOrganization(a.organizationId, () =>
        tenant.projectClientAccess.count({ where: { id: ids.b } }),
      ),
    ).toBe(0);
  });

  it("sans contexte d'organisation, l'accès est refusé", async () => {
    await expect(tenant.projectClientAccess.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
  });

  it("le client brut est le seul chemin transversal : il voit les deux", async () => {
    expect((await raw.projectClientAccess.findMany()).map((r) => r.id)).toEqual(
      expect.arrayContaining([ids.a, ids.b]),
    );
  });
});

describe("TK-55a : écritures sous contexte d'organisation", () => {
  it("create sans organizationId affecte l'organisation du contexte", async () => {
    const other = await projectClientScope(database, "pc-tenant-c");
    const created = await withOrganization(other.organizationId, () =>
      tenant.projectClientAccess.create({ data: data(other) }),
    );
    expect(created.organizationId).toBe(other.organizationId);
  });

  it("create avec l'organizationId d'une autre organisation est refusé", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.projectClientAccess.create({ data: data(a, { organizationId: b.organizationId }) }),
      ),
    ).rejects.toBeInstanceOf(dbPackage.OrganizationMismatchError);
  });

  it("lier un projet ou un membre d'une autre organisation échoue (FK composites)", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.projectClientAccess.create({ data: data(a, { userId: b.userId }) }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.projectClientAccess.create({ data: data(a, { projectId: b.projectId }) }),
      ),
    ).rejects.toThrow();
  });

  it("le rejeu d'un même lien est un conflit ; skipDuplicates l'absorbe (une seule ligne)", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.projectClientAccess.create({ data: data(a) }),
      ),
    ).rejects.toThrow();
    const replay = await withOrganization(a.organizationId, () =>
      tenant.projectClientAccess.createMany({ data: [data(a)], skipDuplicates: true }),
    );
    expect(replay.count).toBe(0);
    expect(await raw.projectClientAccess.count({ where: { projectId: a.projectId } })).toBe(1);
  });
});

describe("TK-55a : écritures sans effet sur l'autre organisation", () => {
  it("update, delete, updateMany et deleteMany visant l'autre organisation n'ont aucun effet", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.projectClientAccess.update({
          where: { id: ids.b },
          data: { updatedAt: new Date() },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.projectClientAccess.delete({ where: { id: ids.b } }),
      ),
    ).rejects.toThrow();
    const updated = await withOrganization(a.organizationId, () =>
      tenant.projectClientAccess.updateMany({
        where: { id: ids.b },
        data: { updatedAt: new Date() },
      }),
    );
    const deleted = await withOrganization(a.organizationId, () =>
      tenant.projectClientAccess.deleteMany({ where: { id: ids.b } }),
    );
    expect([updated.count, deleted.count]).toEqual([0, 0]);
    expect(await raw.projectClientAccess.findFirst({ where: { id: ids.b } })).not.toBeNull();
  });

  it("supprimer un lien de sa propre organisation fonctionne (retrait d'accès)", async () => {
    const own = await projectClientScope(database, "pc-tenant-d");
    const id = await insertProjectClient(database, own);
    await withOrganization(own.organizationId, () =>
      tenant.projectClientAccess.delete({ where: { id } }),
    );
    expect(await raw.projectClientAccess.findFirst({ where: { id } })).toBeNull();
  });
});
