import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertSuggestion,
  SUGGESTION_MODELS,
  type SuggestionOverrides,
  suggestionScope,
} from "./support/suggestions-fixtures.ts";
import type { Scope } from "./support/ticket-fixtures.ts";

const {
  createDbClient,
  createRawDbClient,
  withOrganization,
  raiseCounterTo,
  TENANT_MODELS,
  TENANT_EXCLUDED_MODELS,
} = dbPackage;

/** Le modèle de TK-51b n'existe pas encore dans le client généré : délégué typé à la main. */
interface Row {
  id: string;
  organizationId: string;
  projectId: string;
  key: string;
  status: string;
  body: string;
}
interface Delegate {
  findMany: (args?: unknown) => Promise<Row[]>;
  findFirst: (args?: unknown) => Promise<Row | null>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<Row>;
  update: (args: unknown) => Promise<Row>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  delete: (args: unknown) => Promise<Row>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
}
type SuggestionClient = Record<"suggestion", Delegate>;

let database: TestDatabase;
let tenant: ReturnType<typeof createDbClient> & SuggestionClient;
let raw: ReturnType<typeof createRawDbClient> & SuggestionClient;
let a: Scope;
let b: Scope;
const ids = { a: "", b: "" };

const seed = (scope: Scope, overrides: SuggestionOverrides = {}) =>
  insertSuggestion(database, scope, { key: "SG-1", ...overrides });

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await suggestionScope(database, "sg-tenant-a");
  b = await suggestionScope(database, "sg-tenant-b");
  ids.a = await seed(a);
  ids.b = await seed(b);
  tenant = createDbClient(database.url) as never;
  raw = createRawDbClient(database.url) as never;
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await raw?.$disconnect();
  await database?.dispose();
}, 60_000);

describe("TK-51b : modèle multi-tenant", () => {
  it("Suggestion est dans TENANT_MODELS, hors exclusions", () => {
    for (const model of SUGGESTION_MODELS) {
      expect([...TENANT_MODELS], model).toContain(model);
      expect(TENANT_EXCLUDED_MODELS).not.toHaveProperty(model);
    }
  });

  it("sous withOrganization(A), la suggestion de B est invisible, et inversement", async () => {
    const seen = async (org: string) =>
      (await withOrganization(org, () => tenant.suggestion.findMany())).map((r) => r.id);
    expect(await seen(a.organizationId)).toEqual([ids.a]);
    expect(await seen(b.organizationId)).toEqual([ids.b]);
    const foreign = await withOrganization(a.organizationId, () =>
      tenant.suggestion.findFirst({ where: { id: ids.b } }),
    );
    expect(foreign).toBeNull();
    expect(
      await withOrganization(a.organizationId, () =>
        tenant.suggestion.count({ where: { id: ids.b } }),
      ),
    ).toBe(0);
  });

  it("sans contexte d'organisation, l'accès est refusé", async () => {
    await expect(tenant.suggestion.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
  });

  it("le client brut est le seul chemin transversal (worker, seed) : il voit les deux", async () => {
    const all = (await raw.suggestion.findMany()).map((r) => r.id);
    expect(all).toEqual(expect.arrayContaining([ids.a, ids.b]));
  });
});

const data = (scope: Scope, extra: Record<string, unknown> = {}) => ({
  projectId: scope.projectId,
  key: "SG-2",
  targetKind: "project",
  body: "Une proposition",
  ...extra,
});

describe("TK-51b : écritures sous contexte d'organisation", () => {
  it("create sans organizationId affecte l'organisation du contexte ; statut open par défaut", async () => {
    const created = await withOrganization(a.organizationId, () =>
      tenant.suggestion.create({ data: data(a) }),
    );
    expect(created.organizationId).toBe(a.organizationId);
    expect(created.status).toBe("open");
  });

  it("create avec l'organizationId d'une autre organisation est refusé", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.suggestion.create({
          data: data(a, { key: "SG-3", organizationId: b.organizationId }),
        }),
      ),
    ).rejects.toBeInstanceOf(dbPackage.OrganizationMismatchError);
  });

  it("créer une suggestion dans le projet d'une autre organisation échoue (FK composite)", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.suggestion.create({ data: data(b, { key: "SG-4" }) }),
      ),
    ).rejects.toThrow();
    expect(await raw.suggestion.count({ where: { projectId: b.projectId, key: "SG-4" } })).toBe(0);
  });
});

describe("TK-51b : écritures sans effet sur l'autre organisation", () => {
  it("update, delete, updateMany et deleteMany visant l'autre organisation n'ont aucun effet", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.suggestion.update({ where: { id: ids.b }, data: { body: "piraté" } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.organizationId, () => tenant.suggestion.delete({ where: { id: ids.b } })),
    ).rejects.toThrow();
    const updated = await withOrganization(a.organizationId, () =>
      tenant.suggestion.updateMany({ where: { id: ids.b }, data: { body: "piraté" } }),
    );
    const deleted = await withOrganization(a.organizationId, () =>
      tenant.suggestion.deleteMany({ where: { id: ids.b } }),
    );
    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);
    expect(
      await raw.suggestion.count({ where: { id: ids.b, body: "Ajouter un export CSV" } }),
    ).toBe(1);
  });

  it("l'unicité (projet, clé) est appliquée à travers le client tenant", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.suggestion.create({ data: data(a, { key: "SG-1" }) }),
      ),
    ).rejects.toThrow();
  });
});

describe("TK-51b : raiseCounterTo accepte le compteur suggestion", () => {
  it("crée puis relève le compteur suggestion sans jamais le baisser", async () => {
    const scope = await suggestionScope(database, "sg-raise");
    const raise = (atLeast: number) =>
      withOrganization(scope.organizationId, () =>
        // `CounterName` n'inclut pas encore "suggestion" (Green) : cast volontaire.
        tenant.$transaction((tx) => raiseCounterTo(tx, scope, "suggestion" as never, atLeast)),
      );
    const value = async () =>
      (
        await database.query<{ last_value: number }>(
          "SELECT last_value FROM project_counters WHERE project_id = $1 AND name::text = 'suggestion'",
          [scope.projectId],
        )
      )[0]?.last_value;

    await raise(12);
    expect(await value()).toBe(12);
    await raise(3);
    expect(await value()).toBe(12);
    await raise(20);
    expect(await value()).toBe(20);
  });

  it("CounterName (src/counters.ts) déclare la valeur suggestion", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../src/counters.ts", import.meta.url), "utf8");
    expect(source).toMatch(/type CounterName\s*=[^;]*"suggestion"/);
  });
});
