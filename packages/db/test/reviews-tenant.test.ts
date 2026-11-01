import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertBaseline,
  insertReview,
  REVIEW_MODELS,
  type ReviewScope,
  reviewScope,
  SHA40,
} from "./support/reviews-fixtures.ts";

const {
  createDbClient,
  createRawDbClient,
  withOrganization,
  TENANT_MODELS,
  TENANT_EXCLUDED_MODELS,
} = dbPackage;

/** Les modèles de TK-51c n'existent pas encore dans le client généré : délégués typés à la main. */
interface Row {
  id: string;
  organizationId: string;
  projectId: string;
  status: string;
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
type Client = Record<"review" | "baseline", Delegate>;

let database: TestDatabase;
let tenant: ReturnType<typeof createDbClient> & Client;
let raw: ReturnType<typeof createRawDbClient> & Client;
let a: ReviewScope;
let b: ReviewScope;
const reviews = { a: "", b: "" };
const baselines = { a: "", b: "" };

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await reviewScope(database, "rv-tenant-a");
  b = await reviewScope(database, "rv-tenant-b");
  reviews.a = await insertReview(database, a);
  reviews.b = await insertReview(database, b);
  baselines.a = await insertBaseline(database, a, { number: 0 });
  baselines.b = await insertBaseline(database, b, { number: 0 });
  tenant = createDbClient(database.url) as never;
  raw = createRawDbClient(database.url) as never;
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await raw?.$disconnect();
  await database?.dispose();
}, 60_000);

describe("TK-51c : modèles multi-tenant", () => {
  it("Review et Baseline sont dans TENANT_MODELS, hors exclusions", () => {
    for (const model of REVIEW_MODELS) {
      expect([...TENANT_MODELS], model).toContain(model);
      expect(TENANT_EXCLUDED_MODELS).not.toHaveProperty(model);
    }
  });

  it("sous withOrganization(A), les lignes de B sont invisibles, et inversement", async () => {
    const seen = async (org: string, model: keyof Client) =>
      (await withOrganization(org, () => tenant[model].findMany())).map((r) => r.id);
    expect(await seen(a.organizationId, "review")).toEqual([reviews.a]);
    expect(await seen(b.organizationId, "review")).toEqual([reviews.b]);
    expect(await seen(a.organizationId, "baseline")).toEqual([baselines.a]);
    expect(await seen(b.organizationId, "baseline")).toEqual([baselines.b]);
    expect(
      await withOrganization(a.organizationId, () =>
        tenant.review.findFirst({ where: { id: reviews.b } }),
      ),
    ).toBeNull();
    expect(
      await withOrganization(a.organizationId, () =>
        tenant.baseline.count({ where: { id: baselines.b } }),
      ),
    ).toBe(0);
  });

  it("sans contexte d'organisation, l'accès est refusé", async () => {
    await expect(tenant.review.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
    await expect(tenant.baseline.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
  });

  it("le client brut est le seul chemin transversal (worker, seed) : il voit les deux", async () => {
    expect((await raw.review.findMany()).map((r) => r.id)).toEqual(
      expect.arrayContaining([reviews.a, reviews.b]),
    );
    expect((await raw.baseline.findMany()).map((r) => r.id)).toEqual(
      expect.arrayContaining([baselines.a, baselines.b]),
    );
  });
});

const reviewData = (scope: ReviewScope, extra: Record<string, unknown> = {}) => ({
  projectId: scope.projectId,
  repoId: scope.repoId,
  targetKind: "feature",
  targetRef: "F-002",
  sha: SHA40,
  status: "approved",
  authorUserId: "00000000-0000-4000-8000-000000000001",
  ...extra,
});

const baselineData = (scope: ReviewScope, extra: Record<string, unknown> = {}) => ({
  projectId: scope.projectId,
  repoId: scope.repoId,
  number: 1,
  proposedSha: SHA40,
  ...extra,
});

describe("TK-51c : écritures sous contexte d'organisation", () => {
  it("create sans organizationId affecte l'organisation du contexte (review, baseline par défaut proposed)", async () => {
    const review = await withOrganization(b.organizationId, () =>
      tenant.review.create({ data: reviewData(b) }),
    );
    expect(review.organizationId).toBe(b.organizationId);
    const baseline = await withOrganization(a.organizationId, () =>
      tenant.baseline.create({ data: baselineData(a, { number: 5 }) }),
    ).catch((error: unknown) => error);
    // Une baseline `proposed` est déjà en cours dans A : l'index partiel la refuse.
    expect(baseline).toBeInstanceOf(Error);
  });

  it("create avec l'organizationId d'une autre organisation est refusé", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.review.create({ data: reviewData(a, { organizationId: b.organizationId }) }),
      ),
    ).rejects.toBeInstanceOf(dbPackage.OrganizationMismatchError);
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.baseline.create({ data: baselineData(a, { organizationId: b.organizationId }) }),
      ),
    ).rejects.toBeInstanceOf(dbPackage.OrganizationMismatchError);
  });

  it("créer dans le projet ou avec le repo d'une autre organisation échoue (FK composites)", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.review.create({ data: reviewData(b, { targetRef: "F-003" }) }),
      ),
    ).rejects.toThrow();
    expect(await raw.review.count({ where: { projectId: b.projectId, targetRef: "F-003" } })).toBe(
      0,
    );
    await expect(
      withOrganization(a.organizationId, () => tenant.baseline.create({ data: baselineData(b) })),
    ).rejects.toThrow();
  });
});

describe("TK-51c : écritures sans effet sur l'autre organisation, reviews immuables", () => {
  it("update, delete, updateMany et deleteMany visant l'autre organisation n'ont aucun effet", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.baseline.update({
          where: { id: baselines.b },
          data: { proposedSha: "b".repeat(40) },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.baseline.delete({ where: { id: baselines.b } }),
      ),
    ).rejects.toThrow();
    const updated = await withOrganization(a.organizationId, () =>
      tenant.baseline.updateMany({
        where: { id: baselines.b },
        data: { proposedSha: "b".repeat(40) },
      }),
    );
    const deleted = await withOrganization(a.organizationId, () =>
      tenant.baseline.deleteMany({ where: { id: baselines.b } }),
    );
    const reviewUpdated = await withOrganization(a.organizationId, () =>
      tenant.review.updateMany({ where: { id: reviews.b }, data: { comment: "piraté" } }),
    );
    const reviewDeleted = await withOrganization(a.organizationId, () =>
      tenant.review.deleteMany({ where: { id: reviews.b } }),
    );
    expect([updated.count, deleted.count, reviewUpdated.count, reviewDeleted.count]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(await raw.baseline.count({ where: { id: baselines.b, proposedSha: SHA40 } })).toBe(1);
    expect(await raw.review.count({ where: { id: reviews.b } })).toBe(1);
  });

  it("modifier ou supprimer une review de sa propre organisation est refusé par le trigger", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.review.update({ where: { id: reviews.a }, data: { status: "changes_requested" } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.organizationId, () => tenant.review.delete({ where: { id: reviews.a } })),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.review.deleteMany({ where: { id: reviews.a } }),
      ),
    ).rejects.toThrow();
    const kept = await raw.review.findFirst({ where: { id: reviews.a } });
    expect(kept?.status).toBe("approved");
  });
});

describe("TK-51c : unicité à travers le client tenant", () => {
  it("l'unicité (projet, numéro) est appliquée à travers le client tenant", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.baseline.create({ data: baselineData(a, { number: 0 }) }),
      ),
    ).rejects.toThrow();
  });
});
