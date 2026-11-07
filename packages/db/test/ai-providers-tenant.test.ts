import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  AI_MODELS,
  insertCredential,
  insertMonthly,
  insertSettings,
  insertUsageModel,
} from "./support/ai-providers-fixtures.ts";
import { insertScope, type Scope } from "./support/ticket-fixtures.ts";

const {
  createDbClient,
  createRawDbClient,
  withOrganization,
  TENANT_MODELS,
  TENANT_EXCLUDED_MODELS,
} = dbPackage;

/** Délégués typés à la main : les modèles de TK-95 n'existent pas dans le client avant génération. */
interface Delegate {
  findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
}
type AiClient = Record<"aiOrganizationSettings" | "aiUsageModel" | "aiUsageMonthly", Delegate>;

let database: TestDatabase;
let tenant: ReturnType<typeof createDbClient> & AiClient;
let raw: ReturnType<typeof createRawDbClient> & AiClient;
let a: Scope;
let b: Scope;

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await insertScope(database, "ai-tenant-a");
  b = await insertScope(database, "ai-tenant-b");
  for (const scope of [a, b]) {
    await insertCredential(database, scope.organizationId, "anthropic");
    await insertSettings(database, scope.organizationId, { primary: "anthropic", cap: 5_000_000 });
    await insertUsageModel(database, scope.organizationId, "idea_space", "anthropic");
    await insertMonthly(database, scope.organizationId, { calls: 1, cost: 10 });
  }
  tenant = createDbClient(database.url) as never;
  raw = createRawDbClient(database.url) as never;
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await raw?.$disconnect();
  await database?.dispose();
}, 60_000);

const delegates = () =>
  [
    ["AiOrganizationSettings", (c: AiClient) => c.aiOrganizationSettings],
    ["AiUsageModel", (c: AiClient) => c.aiUsageModel],
    ["AiUsageMonthly", (c: AiClient) => c.aiUsageMonthly],
  ] as const;

describe("TK-95 : modèles multi-tenant", () => {
  it("les trois modèles sont dans TENANT_MODELS, hors exclusions", () => {
    for (const model of AI_MODELS) {
      expect([...TENANT_MODELS], model).toContain(model);
      expect(TENANT_EXCLUDED_MODELS).not.toHaveProperty(model);
    }
  });

  it.each(delegates())(
    "%s : sous withOrganization(A), les lignes de B sont invisibles",
    async (_n, pick) => {
      const own = await withOrganization(a.organizationId, () => pick(tenant).findMany());
      expect(own).toHaveLength(1);
      expect(own[0]?.organizationId).toBe(a.organizationId);
      const other = await withOrganization(b.organizationId, () => pick(tenant).findMany());
      expect(other[0]?.organizationId).toBe(b.organizationId);
    },
  );

  it.each(delegates())(
    "%s : sans contexte d'organisation, toute lecture est refusée",
    async (_n, pick) => {
      await expect(pick(tenant).findMany()).rejects.toThrow();
    },
  );

  it.each(delegates())(
    "%s : une écriture de masse sous A ne touche jamais B (même avec le where de B)",
    async (_n, pick) => {
      const epoch = new Date(0);
      const bBefore = await pick(raw).findMany({ where: { organizationId: b.organizationId } });
      const updated = await withOrganization(a.organizationId, () =>
        pick(tenant).updateMany({
          where: { organizationId: b.organizationId },
          data: { updatedAt: epoch },
        }),
      );
      expect(updated.count).toBe(1);
      expect(await pick(raw).findMany({ where: { organizationId: b.organizationId } })).toEqual(
        bBefore,
      );
      const deleted = await withOrganization(a.organizationId, () =>
        pick(tenant).deleteMany({ where: { organizationId: b.organizationId } }),
      );
      expect(deleted.count).toBe(1);
      expect(await pick(raw).count({ where: { organizationId: b.organizationId } })).toBe(1);
      expect(await pick(raw).count({ where: { organizationId: a.organizationId } })).toBe(0);
    },
  );
});
