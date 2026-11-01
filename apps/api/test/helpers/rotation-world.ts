import { randomBytes } from "node:crypto";
import { withOrganization } from "@koklo/db";
import type { TestDatabase } from "@koklo/db/testing";
import type { LlmProviderId } from "@koklo/domain";
import { createKeyRing } from "../../src/crypto/key-ring.ts";
import { createTokenCipher, type TokenCipher } from "../../src/crypto/token-cipher.ts";
import { DatabaseService } from "../../src/database/database.module.ts";
import { llmCredentialAad } from "../../src/llm-credential/llm-credential-aad.ts";
import { PrismaLlmCredentialRepository } from "../../src/llm-credential/prisma-llm-credential.repository.ts";
import { PrismaUserCredentials } from "../../src/repo/prisma-user-credentials.ts";
import { configFor, createSeededDatabase } from "./app.ts";
import { makeSentinel } from "./llm-credentials.ts";
import { insertInstallation } from "./repos.ts";
import { createWorld, type World } from "./tickets.ts";

/** Clés factices (aléatoires, jamais une vraie clé) des tests de rotation. */
export const K1 = randomBytes(32);
export const K2 = randomBytes(32);
export const ring = (current: [number, Buffer], previous: Array<[number, Buffer]> = []) =>
  createKeyRing({
    current: { version: current[0], key: current[1] },
    previous: previous.map(([version, key]) => ({ version, key })),
  });
export const V1: TokenCipher = createTokenCipher(K1, { keyVersion: 1 });
export const SETTINGS = {
  current: { version: 2, key: K2 },
  previous: [{ version: 1, key: K1 }],
};

export interface Seeded {
  readonly llm: Array<{ organizationId: string; provider: LlmProviderId; plaintext: string }>;
  readonly tokens: Array<{
    organizationId: string;
    userId: string;
    installationId: string;
    token: string;
  }>;
}

export interface RotationHarness {
  readonly database: TestDatabase;
  readonly service: DatabaseService;
  readonly a: World;
  readonly b: World;
  readonly installations: Record<string, string>;
  seed(cipher?: TokenCipher): Promise<Seeded>;
  dispose(): Promise<void>;
}

const ORG_COUNT = 2;

async function seedRows(
  database: TestDatabase,
  service: DatabaseService,
  worlds: [World, World],
  installations: Record<string, string>,
  cipher: TokenCipher,
): Promise<Seeded> {
  const [a, b] = worlds;
  await database.query("DELETE FROM llm_provider_credentials");
  await database.query("DELETE FROM provider_user_credentials");
  const repository = new PrismaLlmCredentialRepository(service);
  const llm: Seeded["llm"] = [];
  const tokens: Seeded["tokens"] = [];
  const plan: Array<[World, LlmProviderId[]]> = [
    [a, ["anthropic", "openai"]],
    [b, ["anthropic"]],
  ];
  for (const [world, providers] of plan) {
    for (const provider of providers) {
      const plaintext = makeSentinel();
      await repository.upsert(world.organizationId, {
        provider,
        secret: cipher.encrypt(plaintext, llmCredentialAad(world.organizationId, provider)),
        defaultModel: null,
        createdByUserId: null,
        at: "2026-01-01T00:00:00.000Z",
      });
      llm.push({ organizationId: world.organizationId, provider, plaintext });
    }
    const userId = world.actors.owner.userId;
    const installationId = installations[world.organizationId] as string;
    const token = `jeton-factice-${randomBytes(12).toString("hex")}`;
    const store = new PrismaUserCredentials(service, cipher);
    await withOrganization(world.organizationId, () =>
      store.save(userId, installationId, {
        token,
        expiresAt: "2027-01-01T00:00:00.000Z",
        refreshToken: `${token}-refresh`,
        refreshExpiresAt: "2027-06-01T00:00:00.000Z",
      }),
    );
    tokens.push({ organizationId: world.organizationId, userId, installationId, token });
  }
  await database.query("UPDATE llm_provider_credentials SET updated_at = '2026-01-01T00:00:00Z'");
  await database.query("UPDATE provider_user_credentials SET updated_at = '2026-01-01T00:00:00Z'");
  return { llm, tokens };
}

/** Base réelle, deux organisations, lignes chiffrées par le chiffreur donné (v1 par défaut). */
export async function createRotationHarness(): Promise<RotationHarness> {
  const database = await createSeededDatabase();
  const a = await createWorld(database);
  const b = await createWorld(database);
  const service = new DatabaseService(
    configFor({ databaseUrl: database.url, appVersion: "dev", appEnv: "test" }),
  );
  const installations: Record<string, string> = {};
  for (const world of [a, b]) {
    installations[world.organizationId] = (
      await insertInstallation(database, world.organizationId)
    ).id;
  }
  return {
    database,
    service,
    a,
    b,
    installations,
    seed: (cipher = V1) => seedRows(database, service, [a, b], installations, cipher),
    async dispose() {
      await service.onModuleDestroy();
      await database.dispose();
    },
  };
}

export const ORGANIZATIONS = ORG_COUNT;

/** Lecture brute des deux tables (octets compris), pour comparer avant/après. */
export const snapshot = async (database: TestDatabase) => ({
  llm: await database.query<Record<string, unknown>>(
    "SELECT * FROM llm_provider_credentials ORDER BY organization_id, provider",
  ),
  tokens: await database.query<Record<string, unknown>>(
    "SELECT * FROM provider_user_credentials ORDER BY organization_id, user_id",
  ),
});

/** Déchiffre toutes les lignes avec le porte-clés donné (AAD recalculées) et rend les clairs. */
export async function decryptAll(harness: RotationHarness, cipher: TokenCipher, seeded: Seeded) {
  const llm: string[] = [];
  for (const row of seeded.llm) {
    const [stored] = await harness.database.query<Record<string, unknown>>(
      "SELECT ciphertext, nonce, key_version FROM llm_provider_credentials WHERE organization_id = $1 AND provider = $2::llm_provider",
      [row.organizationId, row.provider],
    );
    llm.push(
      cipher.decrypt(
        {
          ciphertext: stored?.ciphertext as Buffer,
          nonce: stored?.nonce as Buffer,
          keyVersion: stored?.key_version as number,
        },
        llmCredentialAad(row.organizationId, row.provider),
      ),
    );
  }
  const store = new PrismaUserCredentials(harness.service, cipher);
  const tokens: Array<string | undefined> = [];
  for (const row of seeded.tokens) {
    const found = await withOrganization(row.organizationId, () =>
      store.find(row.userId, row.installationId),
    );
    tokens.push(found?.token);
  }
  return { llm, tokens };
}
