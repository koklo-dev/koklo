import { randomBytes } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import { framePrompt, type LlmBudget, trusted, Untrusted } from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { AiProviderRouter, actualCostMicroUsd } from "@koklo/llm";
import { qualifiedCatalog, RecordingEvents } from "@koklo/llm/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaAiCredentialSource } from "../src/ai/prisma-ai-credential-source.ts";
import { PrismaAiRoutingStore } from "../src/ai/prisma-ai-routing-store.ts";
import { PrismaAiUsageMeter } from "../src/ai/prisma-ai-usage-meter.ts";
import type { Clock } from "../src/clock.ts";
import { createKeyRing } from "../src/crypto/key-ring.ts";
import { DatabaseService } from "../src/database/database.module.ts";
import { LlmCredentialResolver } from "../src/llm-credential/llm-credential.resolver.ts";
import { LlmCredentialService } from "../src/llm-credential/llm-credential.service.ts";
import { PrismaLlmCredentialRepository } from "../src/llm-credential/prisma-llm-credential.repository.ts";
import { configFor, createSeededDatabase } from "./helpers/app.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-95 (lot C), sur base réelle : implémentations Prisma des ports du moteur. Réglages lus par
 * organisation, compteurs mensuels incrémentés atomiquement (mois UTC), marqueur d'alerte posé une seule
 * fois par mois, cloisonnement par organisation, et le moteur de bout en bout sur ces ports.
 */
const ring = createKeyRing({ current: { version: 1, key: randomBytes(32) }, previous: [] });
let instant = "2026-11-15T12:00:00.000Z";
const clock: Clock = { now: () => instant };

let database: TestDatabase;
let databaseService: DatabaseService;
let credentials: LlmCredentialService;
let routing: PrismaAiRoutingStore;
let meter: PrismaAiUsageMeter;
let a: World;
let b: World;

beforeAll(async () => {
  database = await createSeededDatabase();
  a = await createWorld(database);
  b = await createWorld(database);
  databaseService = new DatabaseService(
    configFor({ databaseUrl: database.url, appVersion: "dev", appEnv: "test" }),
  );
  const repository = new PrismaLlmCredentialRepository(databaseService);
  credentials = new LlmCredentialService(repository, ring, clock);
  routing = new PrismaAiRoutingStore(databaseService);
  meter = new PrismaAiUsageMeter(databaseService, clock);
}, 180_000);

afterAll(async () => {
  await databaseService?.onModuleDestroy();
  await database?.dispose();
}, 60_000);

beforeEach(async () => {
  instant = "2026-11-15T12:00:00.000Z";
  for (const table of [
    "ai_usage_monthly",
    "ai_usage_models",
    "ai_organization_settings",
    "llm_provider_credentials",
  ]) {
    await database.query(`DELETE FROM ${table}`);
  }
});

const key = (org: World, provider: Parameters<LlmCredentialService["set"]>[1]) =>
  credentials.set(
    org.organizationId,
    provider,
    provider === "openai_compatible"
      ? { apiKey: makeSentinel(), baseUrl: "https://llm.example.org/v1" }
      : { apiKey: makeSentinel() },
  );
const BUDGET: LlmBudget = {
  maxOutputTokens: 1_000,
  timeoutMs: 30_000,
  maxPromptChars: 10_000,
  maxCostMicroUsd: 5_000_000,
};
const usageOf = (org: World, tokens = 100) => ({
  organizationId: org.organizationId,
  provider: "anthropic" as const,
  inputTokens: tokens,
  outputTokens: tokens / 2,
  costMicroUsd: 1_000,
});
const rows = (org: World) =>
  database.query<Record<string, string>>(
    `SELECT provider::text AS provider, month::text AS month, calls::text AS calls,
            input_tokens::text AS input_tokens, output_tokens::text AS output_tokens,
            cost_micro_usd::text AS cost_micro_usd
     FROM ai_usage_monthly WHERE organization_id = $1 ORDER BY month, provider`,
    [org.organizationId],
  );

describe("PrismaAiRoutingStore", () => {
  it("sans ligne de réglages : secours activé, aucun principal, aucun plafond, clés valides listées", async () => {
    await key(a, "anthropic");
    await key(a, "mistral");
    await credentials.invalidate(a.organizationId, "mistral");
    const loaded = await routing.load(a.organizationId);
    expect(loaded).toEqual({
      fallbackEnabled: true,
      usageModels: {},
      availableProviders: ["anthropic"],
    });
  });

  it("lit principal, secours, interrupteur, plafond (nombre), modèles par usage", async () => {
    await key(a, "anthropic");
    await key(a, "openai");
    await database.query(
      `INSERT INTO ai_organization_settings (organization_id, primary_provider, fallback_provider, fallback_enabled, monthly_cap_micro_usd, created_at, updated_at)
       VALUES ($1, 'anthropic', 'openai', false, 3000000000, now(), now())`,
      [a.organizationId],
    );
    await database.query(
      `INSERT INTO ai_usage_models (organization_id, usage, provider, model, created_at, updated_at)
       VALUES ($1, 'ticket_breakdown', 'openai', 'gpt-modele', now(), now())`,
      [a.organizationId],
    );
    const loaded = await routing.load(a.organizationId);
    expect(loaded.primary).toBe("anthropic");
    expect(loaded.fallback).toBe("openai");
    expect(loaded.fallbackEnabled).toBe(false);
    expect(loaded.monthlyCapMicroUsd).toBe(3_000_000_000);
    expect(loaded.usageModels).toEqual({
      ticket_breakdown: { provider: "openai", model: "gpt-modele" },
    });
    expect([...loaded.availableProviders].sort()).toEqual(["anthropic", "openai"]);
  });

  it("ne lit jamais les réglages ni les clés d'une autre organisation", async () => {
    await key(b, "mistral");
    await database.query(
      "INSERT INTO ai_organization_settings (organization_id, primary_provider, monthly_cap_micro_usd, created_at, updated_at) VALUES ($1, 'mistral', 5, now(), now())",
      [b.organizationId],
    );
    const loaded = await routing.load(a.organizationId);
    expect(loaded.primary).toBeUndefined();
    expect(loaded.monthlyCapMicroUsd).toBeUndefined();
    expect(loaded.availableProviders).toEqual([]);
  });
});

describe("PrismaAiUsageMeter : compteurs", () => {
  it("record crée la ligne (organisation, mois UTC, fournisseur) puis l'incrémente", async () => {
    await meter.record(usageOf(a, 100));
    await meter.record(usageOf(a, 300));
    expect(await rows(a)).toEqual([
      {
        provider: "anthropic",
        month: "2026-11-01",
        calls: "2",
        input_tokens: "400",
        output_tokens: "200",
        cost_micro_usd: "2000",
      },
    ]);
  });

  it("40 enregistrements simultanés ne perdent aucune incrémentation", async () => {
    await Promise.all(Array.from({ length: 40 }, () => meter.record(usageOf(a, 10))));
    const [row] = await rows(a);
    expect(row).toMatchObject({
      calls: "40",
      input_tokens: "400",
      output_tokens: "200",
      cost_micro_usd: "40000",
    });
  });

  it("supporte des totaux au-delà de 2^31 (BIGINT)", async () => {
    await meter.record({ ...usageOf(a), inputTokens: 2_000_000_000, costMicroUsd: 2_500_000_000 });
    await meter.record({ ...usageOf(a), inputTokens: 2_000_000_000, costMicroUsd: 2_500_000_000 });
    const [row] = await rows(a);
    expect(row).toMatchObject({ input_tokens: "4000000000", cost_micro_usd: "5000000000" });
  });

  it("un fournisseur, un mois et une organisation chacun leur ligne ; mois UTC à la frontière", async () => {
    instant = "2026-11-30T23:59:59.999Z";
    await meter.record(usageOf(a));
    await meter.record({ ...usageOf(a), provider: "mistral" });
    await meter.record(usageOf(b));
    instant = "2026-12-01T00:00:00.000Z";
    await meter.record(usageOf(a));
    expect((await rows(a)).map((r) => `${r.month} ${r.provider}`)).toEqual([
      "2026-11-01 anthropic",
      "2026-11-01 mistral",
      "2026-12-01 anthropic",
    ]);
    expect(await rows(b)).toHaveLength(1);
  });

  it("refuse des valeurs invalides (négatives, non entières) sans rien écrire", async () => {
    for (const bad of [
      { inputTokens: -1 },
      { outputTokens: 1.5 },
      { costMicroUsd: Number.NaN },
      { costMicroUsd: Number.MAX_SAFE_INTEGER + 2 },
    ]) {
      await expect(meter.record({ ...usageOf(a), ...bad })).rejects.toThrow();
    }
    expect(await rows(a)).toEqual([]);
  });
});

describe("PrismaAiUsageMeter : mois et alerte", () => {
  it("month() additionne tous les fournisseurs du mois courant seulement", async () => {
    await meter.record(usageOf(a));
    await meter.record({ ...usageOf(a), provider: "mistral", costMicroUsd: 500 });
    instant = "2026-12-02T08:00:00.000Z";
    expect(await meter.month(a.organizationId)).toEqual({
      costMicroUsd: 0,
      warnedThisMonth: false,
    });
    instant = "2026-11-20T08:00:00.000Z";
    expect(await meter.month(a.organizationId)).toEqual({
      costMicroUsd: 1_500,
      warnedThisMonth: false,
    });
    expect(await meter.month(b.organizationId)).toEqual({
      costMicroUsd: 0,
      warnedThisMonth: false,
    });
  });

  it("markCapWarned est vrai pour un seul appelant par mois, même en concurrence", async () => {
    await key(a, "anthropic");
    await database.query(
      "INSERT INTO ai_organization_settings (organization_id, primary_provider, monthly_cap_micro_usd, created_at, updated_at) VALUES ($1, 'anthropic', 100, now(), now())",
      [a.organizationId],
    );
    const results = await Promise.all(
      Array.from({ length: 10 }, () => meter.markCapWarned(a.organizationId)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await meter.month(a.organizationId)).warnedThisMonth).toBe(true);
    expect(await meter.markCapWarned(a.organizationId)).toBe(false);
    instant = "2026-12-03T08:00:00.000Z";
    expect((await meter.month(a.organizationId)).warnedThisMonth).toBe(false);
    expect(await meter.markCapWarned(a.organizationId)).toBe(true);
  });

  it("markCapWarned ne touche ni ne crée rien sans réglages, ni chez une autre organisation", async () => {
    expect(await meter.markCapWarned(a.organizationId)).toBe(false);
    expect(await database.query("SELECT 1 FROM ai_organization_settings")).toHaveLength(0);
    await key(b, "anthropic");
    await database.query(
      "INSERT INTO ai_organization_settings (organization_id, primary_provider, monthly_cap_micro_usd, created_at, updated_at) VALUES ($1, 'anthropic', 100, now(), now())",
      [b.organizationId],
    );
    expect(await meter.markCapWarned(a.organizationId)).toBe(false);
    expect((await meter.month(b.organizationId)).warnedThisMonth).toBe(false);
  });
});

const engine = (providers: Parameters<typeof FakeLlm.replying>[0][] = ["réponse"]) => {
  const resolver = new LlmCredentialResolver(
    new PrismaLlmCredentialRepository(databaseService),
    ring,
  );
  const events = new RecordingEvents();
  const fake = FakeLlm.replying(providers[0] ?? "réponse");
  const router = new AiProviderRouter({
    routing,
    credentials: new PrismaAiCredentialSource(resolver),
    meter,
    catalog: qualifiedCatalog([
      {
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        usages: ["idea_space", "spec_deliverables", "baseline_summary", "ticket_breakdown"],
        economy: false,
      },
    ]),
    events,
    providerFor: () => fake,
  });
  return { router, events };
};
const request = (org: World) => ({
  organizationId: org.organizationId,
  usage: "idea_space" as const,
  euOnly: false,
  prompt: framePrompt({
    instructions: trusted`Résume les données.`,
    data: [new Untrusted("brief", "Donnée fictive.")],
    nonce: "N0nceDeTest9876Zq",
  }),
  output: { kind: "text" as const },
  budget: BUDGET,
  trace: { purpose: "idea-space", correlationId: "req-1" },
});

describe("moteur de bout en bout sur les ports Prisma", () => {
  it("un appel réussi persiste appels, jetons et coût réel chez le fournisseur servi ; une erreur ne compte rien", async () => {
    await key(a, "anthropic");
    const { router } = engine();
    const response = await router.complete(request(a));
    const [row] = await rows(a);
    expect(response.provider).toBe("anthropic");
    expect(row?.provider).toBe("anthropic");
    expect(row?.calls).toBe("1");
    expect(Number(row?.input_tokens)).toBe(response.usage.inputTokens);
    expect(Number(row?.output_tokens)).toBe(response.usage.outputTokens);
    expect(Number(row?.cost_micro_usd)).toBe(
      actualCostMicroUsd("anthropic", "claude-sonnet-5-5", response.usage),
    );
    await expect(router.complete(request(b))).rejects.toThrow();
    expect(await rows(b)).toEqual([]);
  });

  it("au plafond, l'appel est refusé avant tout appel et le compteur ne bouge plus", async () => {
    await key(a, "anthropic");
    await database.query(
      "INSERT INTO ai_organization_settings (organization_id, primary_provider, monthly_cap_micro_usd, created_at, updated_at) VALUES ($1, 'anthropic', 1000, now(), now())",
      [a.organizationId],
    );
    await meter.record({ ...usageOf(a), costMicroUsd: 1_000 });
    const { router } = engine();
    await expect(router.complete(request(a))).rejects.toMatchObject({ name: "AiCapReachedError" });
    expect((await rows(a))[0]?.calls).toBe("1");
  });
});
