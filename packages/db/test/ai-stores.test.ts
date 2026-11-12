import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AiUsageMeterStore,
  createDbClient,
  LlmCredentialLookupStore,
  RoutingSettingsStore,
  type TenantClient,
} from "../src/index.ts";
import { runPrismaOrThrow } from "../src/testing/prisma-cli.ts";
import { createTestDatabase, type TestDatabase } from "../src/testing/test-database.ts";
import { insertLlmCredential, llmScope } from "./support/llm-credentials-fixtures.ts";
import type { Scope } from "./support/ticket-fixtures.ts";

/**
 * TK-99a lot B : les magasins d'IA (réglages, compteur mensuel, clés) vivent dans `@koklo/db`, client tenant
 * en paramètre : l'API et le worker les partagent. Comportement identique à celui de l'API (TK-95).
 */
let database: TestDatabase;
let client: TenantClient;
let a: Scope;
let b: Scope;
let now = "2026-11-15T12:00:00.000Z";
const clock = { now: () => now };

beforeAll(async () => {
  database = await createTestDatabase();
  runPrismaOrThrow(["migrate", "deploy"], database.url);
  a = await llmScope(database, "ai-store-a");
  b = await llmScope(database, "ai-store-b");
  client = createDbClient(database.url);
}, 180_000);
afterAll(async () => {
  await client?.$disconnect();
  await database?.dispose();
}, 60_000);

describe("RoutingSettingsStore", () => {
  it("sans réglages : secours activé, ni principal ni plafond, aucun fournisseur disponible", async () => {
    const routing = await new RoutingSettingsStore(client).load(a.organizationId);
    expect(routing).toEqual({ fallbackEnabled: true, usageModels: {}, availableProviders: [] });
  });

  it("liste seulement les clés non invalidées de l'organisation lue", async () => {
    await insertLlmCredential(database, { organizationId: a.organizationId });
    await insertLlmCredential(database, {
      organizationId: b.organizationId,
      provider: "mistral",
    });
    const store = new RoutingSettingsStore(client);
    expect((await store.load(a.organizationId)).availableProviders).toEqual(["anthropic"]);
    expect((await store.load(b.organizationId)).availableProviders).toEqual(["mistral"]);
  });
});

describe("AiUsageMeterStore", () => {
  it("compte atomiquement par mois UTC et remet à zéro le mois suivant", async () => {
    const meter = new AiUsageMeterStore(client, clock);
    const entry = { provider: "anthropic" as const, inputTokens: 10, outputTokens: 5 };
    await Promise.all([
      meter.record({ organizationId: a.organizationId, ...entry, costMicroUsd: 100 }),
      meter.record({ organizationId: a.organizationId, ...entry, costMicroUsd: 200 }),
    ]);
    expect((await meter.month(a.organizationId)).costMicroUsd).toBe(300);
    expect((await meter.month(b.organizationId)).costMicroUsd).toBe(0);
    now = "2026-12-01T00:00:00.000Z";
    expect((await meter.month(a.organizationId)).costMicroUsd).toBe(0);
    now = "2026-11-15T12:00:00.000Z";
  });

  it("refuse un compte négatif ou non entier", async () => {
    const meter = new AiUsageMeterStore(client, clock);
    await expect(
      meter.record({
        organizationId: a.organizationId,
        provider: "anthropic",
        inputTokens: -1,
        outputTokens: 0,
        costMicroUsd: 0,
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("pose le marqueur d'alerte une seule fois par mois", async () => {
    const meter = new AiUsageMeterStore(client, clock);
    await database.query(
      "INSERT INTO ai_organization_settings (organization_id, updated_at) VALUES ($1, now())",
      [a.organizationId],
    );
    expect(await meter.markCapWarned(a.organizationId)).toBe(true);
    expect(await meter.markCapWarned(a.organizationId)).toBe(false);
    expect((await meter.month(a.organizationId)).warnedThisMonth).toBe(true);
  });
});

describe("LlmCredentialLookupStore", () => {
  it("rend la ligne chiffrée, sa révision (hex du nonce) et null pour une clé absente", async () => {
    const store = new LlmCredentialLookupStore(client);
    const found = await store.find(a.organizationId, "anthropic");
    expect(found).toMatchObject({
      organizationId: a.organizationId,
      provider: "anthropic",
      invalidatedAt: null,
      revision: Buffer.alloc(12, 5).toString("hex"),
    });
    expect(found?.secret.keyVersion).toBe(1);
    expect(Buffer.isBuffer(found?.secret.ciphertext)).toBe(true);
    expect(await store.find(a.organizationId, "mistral")).toBeNull();
  });

  it("ne rend jamais la clé d'une autre organisation", async () => {
    const store = new LlmCredentialLookupStore(client);
    expect(await store.find(b.organizationId, "anthropic")).toBeNull();
  });
});
