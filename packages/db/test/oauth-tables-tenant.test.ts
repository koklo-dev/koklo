import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as dbPackage from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import {
  insertCredential,
  insertState,
  OAUTH_MODELS,
  type OauthScene,
  oauthScene,
} from "./support/oauth-fixtures.ts";

const {
  createDbClient,
  createRawDbClient,
  withOrganization,
  TENANT_MODELS,
  TENANT_EXCLUDED_MODELS,
} = dbPackage;

/** Les modèles de TK-48a1 n'existent pas encore dans le client généré : délégués typés à la main. */
interface Delegate {
  findMany: (args?: unknown) => Promise<{ id: string; organizationId: string }[]>;
  findFirst: (args?: unknown) => Promise<{ id: string } | null>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<{ id: string; organizationId: string }>;
  update: (args: unknown) => Promise<{ id: string }>;
  delete: (args: unknown) => Promise<{ id: string }>;
}
type OauthClient = Record<"providerAuthState" | "providerUserCredential", Delegate>;

let database: TestDatabase;
let tenant: ReturnType<typeof createDbClient> & OauthClient;
let raw: ReturnType<typeof createRawDbClient> & OauthClient;
let a: OauthScene;
let b: OauthScene;
const ids: { stateA: string; stateB: string; credentialA: string; credentialB: string } = {
  stateA: "",
  stateB: "",
  credentialA: "",
  credentialB: "",
};

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await oauthScene(database, "tenant-a");
  b = await oauthScene(database, "tenant-b");
  ids.stateA = await insertState(database, a);
  ids.stateB = await insertState(database, b);
  ids.credentialA = await insertCredential(database, a);
  ids.credentialB = await insertCredential(database, b);
  tenant = createDbClient(database.url) as never;
  raw = createRawDbClient(database.url) as never;
}, 180_000);

afterAll(async () => {
  await tenant?.$disconnect();
  await raw?.$disconnect();
  await database?.dispose();
}, 60_000);

describe("TK-48a1 AC-48-04 : modèles multi-tenant", () => {
  it("ProviderAuthState et ProviderUserCredential sont dans TENANT_MODELS, hors exclusions", () => {
    for (const model of OAUTH_MODELS) {
      expect([...TENANT_MODELS], model).toContain(model);
      expect(TENANT_EXCLUDED_MODELS).not.toHaveProperty(model);
    }
  });

  it("sous withOrganization(A), les états et jetons de B sont invisibles", async () => {
    const seen = async (delegate: keyof OauthClient, org: string) =>
      (await withOrganization(org, () => tenant[delegate].findMany())).map((r) => r.id);

    expect(await seen("providerAuthState", a.scope.organizationId)).toEqual([ids.stateA]);
    expect(await seen("providerUserCredential", a.scope.organizationId)).toEqual([ids.credentialA]);
    expect(await seen("providerAuthState", b.scope.organizationId)).toEqual([ids.stateB]);
    expect(await seen("providerUserCredential", b.scope.organizationId)).toEqual([ids.credentialB]);
    const foreign = await withOrganization(a.scope.organizationId, () =>
      tenant.providerUserCredential.findFirst({ where: { id: ids.credentialB } }),
    );
    expect(foreign).toBeNull();
  });

  it("sans contexte d'organisation, l'accès est refusé", async () => {
    await expect(tenant.providerAuthState.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
    await expect(tenant.providerUserCredential.findMany()).rejects.toBeInstanceOf(
      dbPackage.MissingOrganizationContextError,
    );
  });
});

describe("TK-48a1 AC-48-04 : écritures sous contexte d'organisation", () => {
  it("create sans organizationId affecte l'organisation du contexte", async () => {
    const created = await withOrganization(a.scope.organizationId, () =>
      tenant.providerAuthState.create({
        data: {
          userId: a.userId,
          nonce: randomUUID(),
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      }),
    );
    expect(created.organizationId).toBe(a.scope.organizationId);
  });

  it("create avec l'organizationId d'une autre organisation est refusé", async () => {
    await expect(
      withOrganization(a.scope.organizationId, () =>
        tenant.providerUserCredential.create({
          data: {
            organizationId: b.scope.organizationId,
            userId: a.userId,
            installationId: a.installationId,
            ciphertext: Buffer.alloc(40),
            nonce: Buffer.alloc(12),
            expiresAt: new Date(Date.now() + 3_600_000),
          },
        }),
      ),
    ).rejects.toBeInstanceOf(dbPackage.OrganizationMismatchError);
  });

  it("update et delete d'une ligne d'une autre organisation n'ont aucun effet (introuvable)", async () => {
    await expect(
      withOrganization(a.scope.organizationId, () =>
        tenant.providerUserCredential.update({
          where: { id: ids.credentialB },
          data: { keyVersion: 9 },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganization(a.scope.organizationId, () =>
        tenant.providerAuthState.delete({ where: { id: ids.stateB } }),
      ),
    ).rejects.toThrow();
    expect(
      await raw.providerUserCredential.count({ where: { id: ids.credentialB, keyVersion: 1 } }),
    ).toBe(1);
    expect(await raw.providerAuthState.count({ where: { id: ids.stateB } })).toBe(1);
  });
});
