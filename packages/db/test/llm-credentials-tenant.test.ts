import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertLlmCredential,
  LLM_MODELS,
  type LlmCredentialOverrides,
  llmScope,
} from "./support/llm-credentials-fixtures.ts";
import type { Scope } from "./support/ticket-fixtures.ts";

const {
  createDbClient,
  createRawDbClient,
  withOrganization,
  TENANT_MODELS,
  TENANT_EXCLUDED_MODELS,
} = dbPackage;

/** Le modèle de TK-51a n'existe pas encore dans le client généré : délégué typé à la main. */
interface Row {
  id: string;
  organizationId: string;
  provider: string;
  keyVersion: number;
}
interface Delegate {
  findMany: (args?: unknown) => Promise<Row[]>;
  findFirst: (args?: unknown) => Promise<Row | null>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<Row>;
  update: (args: unknown) => Promise<Row>;
  delete: (args: unknown) => Promise<Row>;
}
type LlmClient = Record<"llmProviderCredential", Delegate>;

let database: TestDatabase;
let tenant: ReturnType<typeof createDbClient> & LlmClient;
let raw: ReturnType<typeof createRawDbClient> & LlmClient;
let a: Scope;
let b: Scope;
const ids = { a: "", b: "" };

const seed = (scope: Scope, overrides: Partial<LlmCredentialOverrides> = {}) =>
  insertLlmCredential(database, { organizationId: scope.organizationId, ...overrides });

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await llmScope(database, "llm-tenant-a");
  b = await llmScope(database, "llm-tenant-b");
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

describe("TK-51a : modèle multi-tenant", () => {
  it("LlmProviderCredential est dans TENANT_MODELS, hors exclusions", () => {
    for (const model of LLM_MODELS) {
      expect([...TENANT_MODELS], model).toContain(model);
      expect(TENANT_EXCLUDED_MODELS).not.toHaveProperty(model);
    }
  });

  it("sous withOrganization(A), l'identifiant de B est invisible, et inversement", async () => {
    const seen = async (org: string) =>
      (await withOrganization(org, () => tenant.llmProviderCredential.findMany())).map((r) => r.id);
    expect(await seen(a.organizationId)).toEqual([ids.a]);
    expect(await seen(b.organizationId)).toEqual([ids.b]);
    const foreign = await withOrganization(a.organizationId, () =>
      tenant.llmProviderCredential.findFirst({ where: { id: ids.b } }),
    );
    expect(foreign).toBeNull();
    const counted = await withOrganization(a.organizationId, () =>
      tenant.llmProviderCredential.count({ where: { organizationId: b.organizationId } }),
    );
    expect(counted).toBe(0);
  });

  it("sans contexte d'organisation, l'accès est refusé", async () => {
    await expect(tenant.llmProviderCredential.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
  });

  it("le client brut est le seul chemin transversal (worker, seed) : il voit les deux", async () => {
    const all = (await raw.llmProviderCredential.findMany()).map((r) => r.id);
    expect(all).toEqual(expect.arrayContaining([ids.a, ids.b]));
  });
});

describe("TK-51a : écritures sous contexte d'organisation", () => {
  const data = (extra: Record<string, unknown> = {}) => ({
    provider: "google",
    ciphertext: Buffer.alloc(40, 7),
    nonce: Buffer.alloc(12, 4),
    ...extra,
  });

  it("create sans organizationId affecte l'organisation du contexte", async () => {
    const created = await withOrganization(a.organizationId, () =>
      tenant.llmProviderCredential.create({ data: data() }),
    );
    expect(created.organizationId).toBe(a.organizationId);
    expect(created.keyVersion).toBe(1);
  });

  it("create avec l'organizationId d'une autre organisation est refusé", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.llmProviderCredential.create({
          data: data({ provider: "openai", organizationId: b.organizationId }),
        }),
      ),
    ).rejects.toBeInstanceOf(dbPackage.OrganizationMismatchError);
  });

  it("update et delete de l'identifiant d'une autre organisation n'ont aucun effet", async () => {
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.llmProviderCredential.update({ where: { id: ids.b }, data: { keyVersion: 9 } }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.organizationId, () =>
        tenant.llmProviderCredential.delete({ where: { id: ids.b } }),
      ),
    ).rejects.toThrow();
    expect(await raw.llmProviderCredential.count({ where: { id: ids.b, keyVersion: 1 } })).toBe(1);
  });

  it("l'unicité (organisation, fournisseur) est appliquée à travers le client tenant", async () => {
    await expect(
      withOrganization(b.organizationId, () =>
        tenant.llmProviderCredential.create({ data: data({ provider: "anthropic" }) }),
      ),
    ).rejects.toThrow();
  });
});
