import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";

/**
 * Contrat attendu (TK-20) : `createDbClient` renvoie le client multi-tenant (extension `$extends`),
 * `createRawDbClient` le client Prisma non étendu, `withOrganization(orgId, fn)` ouvre le contexte.
 */
const { createDbClient, createRawDbClient, withOrganization } = dbPackage;
const { MissingOrganizationContextError, OrganizationMismatchError, RawQueryNotAllowedError } =
  dbPackage;

const ORG_A = "01900000-0000-7000-8000-0000000000a1";
const ORG_B = "01900000-0000-7000-8000-0000000000b1";
const A1 = "01900000-0000-7000-8000-0000000000a2";
const A2 = "01900000-0000-7000-8000-0000000000a3";
const B1 = "01900000-0000-7000-8000-0000000000b2";
const UNKNOWN = "01900000-0000-7000-8000-0000000000f1";

type Client = ReturnType<typeof createDbClient>;
type Operation = (client: Client) => Promise<unknown>;

// `as never` : les types de données dépendent de l'extension, que ces tests ne figent pas.
const OPERATIONS: Record<string, Operation> = {
  findFirst: (c) => c.project.findFirst(),
  findFirstOrThrow: (c) => c.project.findFirstOrThrow(),
  findUnique: (c) => c.project.findUnique({ where: { id: A1 } }),
  findUniqueOrThrow: (c) => c.project.findUniqueOrThrow({ where: { id: A1 } }),
  findMany: (c) => c.project.findMany(),
  count: (c) => c.project.count(),
  aggregate: (c) => c.project.aggregate({ _count: true }),
  groupBy: (c) => c.project.groupBy({ by: ["name"], _count: true } as never),
  create: (c) => c.project.create({ data: { name: "x", organizationId: ORG_A } as never }),
  createMany: (c) => c.project.createMany({ data: [{ name: "x", organizationId: ORG_A }] }),
  createManyAndReturn: (c) =>
    c.project.createManyAndReturn({ data: [{ name: "x", organizationId: ORG_A }] }),
  update: (c) => c.project.update({ where: { id: A1 }, data: { name: "y" } }),
  updateMany: (c) => c.project.updateMany({ data: { name: "y" } }),
  upsert: (c) =>
    c.project.upsert({
      where: { id: A1 },
      update: { name: "y" },
      create: { name: "x", organizationId: ORG_A } as never,
    }),
  delete: (c) => c.project.delete({ where: { id: A1 } }),
  deleteMany: (c) => c.project.deleteMany(),
};

let database: TestDatabase;
let raw: ReturnType<typeof createRawDbClient>;
let tenant: Client;

async function insertOrganization(id: string, slug: string) {
  await database.query(
    "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES ($1, $2, $2, now(), now())",
    [id, slug],
  );
}

async function insertProject(id: string, organizationId: string, name: string) {
  await database.query(
    "INSERT INTO projects (id, organization_id, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
    [id, organizationId, name],
  );
}

async function projectNames(): Promise<string[]> {
  const rows = await database.query<{ name: string }>("SELECT name FROM projects ORDER BY id");
  return rows.map((row) => row.name);
}

const inA = <T>(fn: () => Promise<T>) => withOrganization(ORG_A, fn);

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  await insertOrganization(ORG_A, "org-a");
  await insertOrganization(ORG_B, "org-b");
  await insertProject(A1, ORG_A, "a1");
  await insertProject(A2, ORG_A, "a2");
  await insertProject(B1, ORG_B, "b1");
  raw = createRawDbClient(database.url);
  tenant = createDbClient(database.url);
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await raw?.$disconnect();
  await database?.dispose();
}, 60_000);

describe("API publique de l'extension multi-tenant (TK-20)", () => {
  it("C0 @koklo/db exporte le contexte, les erreurs nommées et les deux clients", () => {
    expect(typeof withOrganization).toBe("function");
    expect(typeof createRawDbClient).toBe("function");
    for (const error of [
      MissingOrganizationContextError,
      OrganizationMismatchError,
      RawQueryNotAllowedError,
    ]) {
      expect(typeof error).toBe("function");
      expect(new error("x")).toBeInstanceOf(Error);
    }
    expect(new MissingOrganizationContextError("x").name).toBe("MissingOrganizationContextError");
  });

  it("C0 un contexte vide ou non UUID est refusé", async () => {
    for (const orgId of ["", "pas-un-uuid"]) {
      await expect(withOrganization(orgId, async () => 1)).rejects.toBeInstanceOf(
        MissingOrganizationContextError,
      );
    }
  });

  it("C0 withOrganization renvoie la valeur de la fonction et expose l'organisation courante", async () => {
    expect(dbPackage.currentOrganizationId()).toBeUndefined();
    const seen = await withOrganization(ORG_A, async () => dbPackage.currentOrganizationId());
    expect(seen).toBe(ORG_A);
  });
});

describe("C1 chaque opération sur Project sans contexte est rejetée", () => {
  it.each(Object.keys(OPERATIONS))("%s sans contexte", async (name) => {
    const operation = OPERATIONS[name] as Operation;
    await expect(operation(tenant)).rejects.toBeInstanceOf(MissingOrganizationContextError);
    expect(await projectNames()).toEqual(["a1", "a2", "b1"]);
  });
});

describe("C2 isolation entre les organisations A et B", () => {
  it("findMany, count, aggregate et groupBy ne voient que l'organisation courante", async () => {
    const listed = await inA(() => tenant.project.findMany({ orderBy: { id: "asc" } }));
    expect(listed.map((p) => p.id)).toEqual([A1, A2]);
    expect(await inA(() => tenant.project.count())).toBe(2);
    expect((await inA(() => tenant.project.aggregate({ _count: true })))._count).toBe(2);
    const groups = await inA(() =>
      tenant.project.groupBy({ by: ["organizationId"], _count: true } as never),
    );
    expect(groups).toEqual([{ organizationId: ORG_A, _count: 2 }]);
    expect(await withOrganization(ORG_B, () => tenant.project.count())).toBe(1);
  });

  it("findUnique et findFirst sur un id de B sous A ne trouvent rien", async () => {
    expect(await inA(() => tenant.project.findUnique({ where: { id: B1 } }))).toBeNull();
    expect(await inA(() => tenant.project.findFirst({ where: { id: B1 } }))).toBeNull();
    await expect(
      inA(() => tenant.project.findUniqueOrThrow({ where: { id: B1 } })),
    ).rejects.toThrow();
    await expect(
      inA(() => tenant.project.findFirstOrThrow({ where: { id: B1 } })),
    ).rejects.toThrow();
  });
});

describe("C2 isolation : écritures et concurrence", () => {
  it("update, updateMany, upsert et delete sur B sous A ne touchent pas B", async () => {
    await expect(
      inA(() => tenant.project.update({ where: { id: B1 }, data: { name: "piraté" } })),
    ).rejects.toThrow();
    await expect(inA(() => tenant.project.delete({ where: { id: B1 } }))).rejects.toThrow();
    const updated = await inA(() =>
      tenant.project.updateMany({ where: { id: B1 }, data: { name: "piraté" } }),
    );
    expect(updated.count).toBe(0);
    const removed = await inA(() => tenant.project.deleteMany({ where: { id: B1 } }));
    expect(removed.count).toBe(0);
    await inA(() =>
      tenant.project.upsert({
        where: { id: B1 },
        update: { name: "piraté" },
        create: { name: "piraté", organizationId: ORG_A } as never,
      }),
    ).catch(() => undefined);
    expect(await projectNames()).toEqual(["a1", "a2", "b1"]);
  });

  it("deleteMany sous B ne supprime que B, puis la ligne est restaurée", async () => {
    const removed = await withOrganization(ORG_B, () => tenant.project.deleteMany());
    expect(removed.count).toBe(1);
    expect(await projectNames()).toEqual(["a1", "a2"]);
    await insertProject(B1, ORG_B, "b1");
  });

  it("deux contextes concurrents ne se mélangent pas", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        withOrganization(i % 2 === 0 ? ORG_A : ORG_B, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5 - (i % 5)));
          return (await tenant.project.findMany()).map((p) => p.organizationId);
        }),
      ),
    );
    results.forEach((orgs, i) => {
      expect(new Set(orgs), `appel ${i}`).toEqual(new Set([i % 2 === 0 ? ORG_A : ORG_B]));
    });
  });
});

describe("C3 écritures create sous contexte", () => {
  it("create sans organizationId l'affecte à l'organisation courante", async () => {
    const created = await inA(() => tenant.project.create({ data: { name: "auto" } as never }));
    expect(created.organizationId).toBe(ORG_A);
    await database.query("DELETE FROM projects WHERE id = $1", [created.id]);
  });

  it("create avec l'organizationId courant est accepté", async () => {
    const created = await inA(() =>
      tenant.project.create({ data: { name: "explicite", organizationId: ORG_A } as never }),
    );
    expect(created.organizationId).toBe(ORG_A);
    await database.query("DELETE FROM projects WHERE id = $1", [created.id]);
  });

  it("create avec l'organizationId de B sous A est refusé et rien n'est écrit", async () => {
    await expect(
      inA(() =>
        tenant.project.create({ data: { name: "intrus", organizationId: ORG_B } as never }),
      ),
    ).rejects.toBeInstanceOf(OrganizationMismatchError);
    expect(await projectNames()).toEqual(["a1", "a2", "b1"]);
  });

  it("createMany et createManyAndReturn refusent l'organisation de B et affectent A par défaut", async () => {
    await expect(
      inA(() =>
        tenant.project.createMany({
          data: [{ name: "ok" }, { name: "x", organizationId: ORG_B }] as never,
        }),
      ),
    ).rejects.toBeInstanceOf(OrganizationMismatchError);
    await expect(
      inA(() =>
        tenant.project.createManyAndReturn({
          data: [{ name: "x", organizationId: ORG_B }] as never,
        }),
      ),
    ).rejects.toBeInstanceOf(OrganizationMismatchError);
    expect(await projectNames()).toEqual(["a1", "a2", "b1"]);

    const created = await inA(() =>
      tenant.project.createManyAndReturn({ data: [{ name: "lot" }] as never }),
    );
    expect(created.map((p) => p.organizationId)).toEqual([ORG_A]);
    await database.query("DELETE FROM projects WHERE name = 'lot'");
  });

  it("upsert avec création pour B sous A est refusé", async () => {
    await expect(
      inA(() =>
        tenant.project.upsert({
          where: { id: UNKNOWN },
          update: {},
          create: { name: "intrus", organizationId: ORG_B } as never,
        }),
      ),
    ).rejects.toBeInstanceOf(OrganizationMismatchError);
  });
});

describe("C4 modèles exclus et client brut sans contexte", () => {
  it("User, Organization, Member et Session restent interrogeables sans contexte", async () => {
    expect((await tenant.organization.findMany()).length).toBe(2);
    expect(await tenant.user.count()).toBe(0);
    expect(await tenant.member.count()).toBe(0);
    expect(await tenant.session.count()).toBe(0);
    expect(await tenant.invitation.count()).toBe(0);
  });

  it("le client brut lit Project sans contexte, sur toutes les organisations", async () => {
    expect(await raw.project.count()).toBe(3);
  });
});

describe("C5 index organization_id", () => {
  it("projects possède un index sur organization_id", async () => {
    const rows = await database.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'projects'",
    );
    expect(rows.some((row) => /\(organization_id\)/.test(row.indexdef))).toBe(true);
  });
});

describe("C6 requêtes brutes refusées sur le client étendu", () => {
  it.each([
    ["$queryRaw", (c: Client) => c.$queryRaw`SELECT 1`],
    ["$executeRaw", (c: Client) => c.$executeRaw`SELECT 1`],
    ["$queryRawUnsafe", (c: Client) => c.$queryRawUnsafe("SELECT 1")],
    ["$executeRawUnsafe", (c: Client) => c.$executeRawUnsafe("SELECT 1")],
  ])("%s est refusé, avec ou sans contexte", async (_name, run) => {
    await expect(run(tenant)).rejects.toBeInstanceOf(RawQueryNotAllowedError);
    await expect(inA(() => run(tenant))).rejects.toBeInstanceOf(RawQueryNotAllowedError);
  });

  it("le client brut exécute SELECT 1 (sonde de santé, seed, tests)", async () => {
    expect(await raw.$queryRaw`SELECT 1 AS ok`).toEqual([{ ok: 1 }]);
  });
});
