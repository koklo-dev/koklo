import { randomBytes } from "node:crypto";
import type { TestDatabase } from "@koklo/db/testing";
import type { QualifiedModel } from "@koklo/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiSettingsInputError, AiSettingsService } from "../src/ai/ai-settings.service.ts";
import { AiUsageReportService } from "../src/ai/ai-usage-report.service.ts";
import { PrismaAiRoutingStore } from "../src/ai/prisma-ai-routing-store.ts";
import type { Clock } from "../src/clock.ts";
import { createKeyRing } from "../src/crypto/key-ring.ts";
import { DatabaseService } from "../src/database/database.module.ts";
import { LlmCredentialService } from "../src/llm-credential/llm-credential.service.ts";
import { PrismaLlmCredentialRepository } from "../src/llm-credential/prisma-llm-credential.repository.ts";
import { configFor, createSeededDatabase } from "./helpers/app.ts";
import { makeSentinel } from "./helpers/llm-credentials.ts";
import { createWorld, type World } from "./helpers/tickets.ts";

/**
 * TK-95 D : services (sans route) que TK-98 exposera. `AiSettingsService` : fournisseurs principal et
 * secours, interrupteur, plafond mensuel, modèle par usage contre le catalogue ; chaque écriture est
 * auditée et validée côté serveur. `AiUsageReportService` : consommation du mois par fournisseur.
 */
const ring = createKeyRing({ current: { version: 1, key: randomBytes(32) }, previous: [] });
let instant = "2026-11-15T12:00:00.000Z";
const clock: Clock = { now: () => instant };
const ALL_USAGES = [
  "idea_space",
  "spec_deliverables",
  "baseline_summary",
  "ticket_breakdown",
] as const;
const CATALOG: QualifiedModel[] = [
  { provider: "anthropic", model: "claude-sonnet-5-5", usages: [...ALL_USAGES], economy: false },
  { provider: "openai", model: "openai-qualifie", usages: ["idea_space"], economy: true },
  { provider: "openrouter", model: "route-qualifie", usages: [...ALL_USAGES], economy: false },
];

let database: TestDatabase;
let databaseService: DatabaseService;
let credentials: LlmCredentialService;
let settings: AiSettingsService;
let report: AiUsageReportService;
let a: World;
let b: World;
const actor = (world: World) => ({
  organizationId: world.organizationId,
  userId: world.actors.owner.userId,
});

beforeAll(async () => {
  database = await createSeededDatabase();
  databaseService = new DatabaseService(
    configFor({ databaseUrl: database.url, appVersion: "dev", appEnv: "test" }),
  );
  credentials = new LlmCredentialService(
    new PrismaLlmCredentialRepository(databaseService),
    ring,
    clock,
  );
  settings = new AiSettingsService(databaseService, new PrismaAiRoutingStore(databaseService), {
    list: () => CATALOG,
  });
  report = new AiUsageReportService(databaseService, clock);
}, 180_000);

afterAll(async () => {
  await databaseService?.onModuleDestroy();
  await database?.dispose();
}, 60_000);

beforeEach(async () => {
  instant = "2026-11-15T12:00:00.000Z";
  a = await createWorld(database);
  b = await createWorld(database);
});

const key = (world: World, provider: Parameters<LlmCredentialService["set"]>[1]) =>
  credentials.set(world.organizationId, provider, { apiKey: makeSentinel() });
const refusal = async (work: Promise<unknown>): Promise<AiSettingsInputError> => {
  try {
    await work;
  } catch (error) {
    expect(error).toBeInstanceOf(AiSettingsInputError);
    return error as AiSettingsInputError;
  }
  throw new Error("l'écriture aurait dû être refusée");
};
const audits = () =>
  database.query<{ actor_id: string; organization_id: string; target_kind: string }>(
    "SELECT actor_id, organization_id, target_kind FROM audit_log WHERE action = 'ai_settings.update' AND organization_id = $1",
    [a.organizationId],
  );

describe("AiSettingsService : lecture", () => {
  it("sans réglage : secours activé, ni principal ni plafond, usages vides, fournisseurs d'après les clés", async () => {
    await key(a, "anthropic");
    await key(a, "openrouter");
    const view = await settings.get(a.organizationId);
    expect(view).toMatchObject({ fallbackEnabled: true, usageModels: {} });
    expect(view.primary).toBeUndefined();
    expect(view.monthlyCapMicroUsd).toBeUndefined();
    expect(view.providers).toEqual([
      { provider: "anthropic", invalid: false, intermediary: false, euEligible: true },
      { provider: "openrouter", invalid: false, intermediary: true, euEligible: false },
    ]);
    expect(view.qualified).toEqual(CATALOG);
  });

  it("une clé invalidée reste listée, marquée invalide", async () => {
    await key(a, "mistral");
    await credentials.invalidate(a.organizationId, "mistral");
    expect((await settings.get(a.organizationId)).providers).toEqual([
      { provider: "mistral", invalid: true, intermediary: false, euEligible: true },
    ]);
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("AiSettingsService : principal, secours, interrupteur", () => {
  it("enregistre principal et secours, audit signé de l'acteur", async () => {
    await key(a, "anthropic");
    await key(a, "openrouter");
    await settings.setProviders(actor(a), { primary: "anthropic", fallback: "openrouter" });
    const view = await settings.get(a.organizationId);
    expect([view.primary, view.fallback, view.fallbackEnabled]).toEqual([
      "anthropic",
      "openrouter",
      true,
    ]);
    expect(await audits()).toEqual([
      {
        actor_id: a.actors.owner.userId,
        organization_id: a.organizationId,
        target_kind: "organization",
      },
    ]);
  });

  it("l'interrupteur de secours s'écrit seul, sans toucher aux fournisseurs", async () => {
    await key(a, "anthropic");
    await settings.setProviders(actor(a), { primary: "anthropic" });
    await settings.setProviders(actor(a), { fallbackEnabled: false });
    const view = await settings.get(a.organizationId);
    expect([view.primary, view.fallbackEnabled]).toEqual(["anthropic", false]);
  });

  it("null efface le secours", async () => {
    await key(a, "anthropic");
    await key(a, "openai");
    await settings.setProviders(actor(a), { primary: "anthropic", fallback: "openai" });
    await settings.setProviders(actor(a), { fallback: null });
    expect((await settings.get(a.organizationId)).fallback).toBeUndefined();
  });

  it.each([
    ["principal sans clé", { primary: "google" as const }, "primary"],
    ["secours sans clé", { fallback: "google" as const }, "fallback"],
    [
      "principal = secours",
      { primary: "anthropic" as const, fallback: "anthropic" as const },
      "fallback",
    ],
  ])("%s : refusé, rien n'est écrit ni audité", async (_label, input, field) => {
    await key(a, "anthropic");
    const error = await refusal(settings.setProviders(actor(a), input));
    expect(error.field).toBe(field);
    expect(error.message).not.toMatch(/anthropic|openai|google|mistral|openrouter/i);
    expect((await settings.get(a.organizationId)).primary).toBeUndefined();
    expect(await audits()).toEqual([]);
  });

  it("une clé invalidée ne peut pas devenir principal", async () => {
    await key(a, "mistral");
    await credentials.invalidate(a.organizationId, "mistral");
    expect((await refusal(settings.setProviders(actor(a), { primary: "mistral" }))).field).toBe(
      "primary",
    );
  });

  it("principal identique au secours déjà enregistré : refusé aussi", async () => {
    await key(a, "anthropic");
    await key(a, "openai");
    await settings.setProviders(actor(a), { primary: "anthropic", fallback: "openai" });
    expect((await refusal(settings.setProviders(actor(a), { primary: "openai" }))).field).toBe(
      "fallback",
    );
  });

  it("cloisonnement : les réglages d'une organisation ne touchent pas l'autre", async () => {
    await key(a, "anthropic");
    await settings.setProviders(actor(a), { primary: "anthropic" });
    expect((await settings.get(b.organizationId)).primary).toBeUndefined();
  });
});

describe("AiSettingsService : plafond mensuel", () => {
  it.each([1, 5_000_000, Number.MAX_SAFE_INTEGER])("accepte %i micro-dollars", async (cap) => {
    await settings.setMonthlyCap(actor(a), cap);
    expect((await settings.get(a.organizationId)).monthlyCapMicroUsd).toBe(cap);
  });

  it("null retire le plafond (pas de suspension, A1)", async () => {
    await settings.setMonthlyCap(actor(a), 1_000);
    await settings.setMonthlyCap(actor(a), null);
    expect((await settings.get(a.organizationId)).monthlyCapMicroUsd).toBeUndefined();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("refuse %s (B62)", async (cap) => {
    expect((await refusal(settings.setMonthlyCap(actor(a), cap))).field).toBe("monthlyCap");
    expect(await audits()).toEqual([]);
  });

  it("un nouveau plafond rouvre l'alerte du mois (marqueur effacé)", async () => {
    await settings.setMonthlyCap(actor(a), 1_000);
    await database.query(
      "UPDATE ai_organization_settings SET cap_warned_month = '2026-11-01' WHERE organization_id = $1",
      [a.organizationId],
    );
    await settings.setMonthlyCap(actor(a), 2_000);
    const [row] = await database.query<{ cap_warned_month: Date | null }>(
      "SELECT cap_warned_month FROM ai_organization_settings WHERE organization_id = $1",
      [a.organizationId],
    );
    expect(row?.cap_warned_month).toBeNull();
  });
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: suite de cas d'une même procédure, un test par comportement
describe("AiSettingsService : modèle par usage (contre le catalogue qualifié)", () => {
  it("enregistre un modèle qualifié pour l'usage, remplace le précédent", async () => {
    await key(a, "anthropic");
    await key(a, "openrouter");
    await settings.setUsageModel(actor(a), "idea_space", {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
    });
    await settings.setUsageModel(actor(a), "idea_space", {
      provider: "openrouter",
      model: "route-qualifie",
    });
    expect((await settings.get(a.organizationId)).usageModels).toEqual({
      idea_space: { provider: "openrouter", model: "route-qualifie" },
    });
  });

  it.each([
    [
      "modèle hors catalogue",
      "idea_space",
      { provider: "anthropic" as const, model: "modele-libre" },
      "model",
    ],
    [
      "modèle non qualifié pour cet usage",
      "ticket_breakdown",
      { provider: "openai" as const, model: "openai-qualifie" },
      "model",
    ],
    [
      "usage inconnu",
      "autre_usage",
      { provider: "anthropic" as const, model: "claude-sonnet-5-5" },
      "usage",
    ],
  ])("%s : refusé", async (_label, usage, choice, field) => {
    await key(a, "anthropic");
    await key(a, "openai");
    const error = await refusal(settings.setUsageModel(actor(a), usage as never, choice));
    expect(error.field).toBe(field);
    expect(await audits()).toEqual([]);
  });

  it("fournisseur sans clé valide : refusé", async () => {
    expect(
      (
        await refusal(
          settings.setUsageModel(actor(a), "idea_space", {
            provider: "anthropic",
            model: "claude-sonnet-5-5",
          }),
        )
      ).field,
    ).toBe("provider");
  });

  it("effacer un usage le remet au comportement par défaut", async () => {
    await key(a, "anthropic");
    await settings.setUsageModel(actor(a), "idea_space", {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
    });
    await settings.clearUsageModel(actor(a), "idea_space");
    expect((await settings.get(a.organizationId)).usageModels).toEqual({});
  });
});

describe("AiUsageReportService", () => {
  const seed = (world: World, month: string, provider: string, calls: number, cost: number) =>
    database.query(
      `INSERT INTO ai_usage_monthly (organization_id, month, provider, calls, input_tokens, output_tokens, cost_micro_usd, created_at, updated_at)
       VALUES ($1, $2::date, $3::llm_provider, $4, $4 * 100, $4 * 10, $5, now(), now())`,
      [world.organizationId, month, provider, calls, cost],
    );

  it("mois courant : une ligne par fournisseur, total et état du plafond", async () => {
    await seed(a, "2026-11-01", "anthropic", 3, 600_000);
    await seed(a, "2026-11-01", "openai", 1, 250_000);
    await seed(a, "2026-10-01", "anthropic", 9, 9_000_000);
    await seed(b, "2026-11-01", "anthropic", 7, 7_000_000);
    await settings.setMonthlyCap(actor(a), 1_000_000);
    expect(await report.report(a.organizationId)).toEqual({
      month: "2026-11",
      providers: [
        {
          provider: "anthropic",
          calls: 3,
          inputTokens: 300,
          outputTokens: 30,
          costMicroUsd: 600_000,
        },
        { provider: "openai", calls: 1, inputTokens: 100, outputTokens: 10, costMicroUsd: 250_000 },
      ],
      totalCostMicroUsd: 850_000,
      monthlyCapMicroUsd: 1_000_000,
      state: "warning",
    });
  });

  it("sans consommation ni plafond : mois vide, état ok", async () => {
    expect(await report.report(a.organizationId)).toEqual({
      month: "2026-11",
      providers: [],
      totalCostMicroUsd: 0,
      state: "ok",
    });
  });

  it("changement de mois : repart de zéro, mois précédent consultable", async () => {
    await seed(a, "2026-11-01", "anthropic", 2, 100);
    instant = "2026-12-01T00:00:00.000Z";
    expect((await report.report(a.organizationId)).providers).toEqual([]);
    expect((await report.report(a.organizationId, "2026-11")).totalCostMicroUsd).toBe(100);
  });

  it("à 100 % : suspended ; mois invalide refusé", async () => {
    await seed(a, "2026-11-01", "anthropic", 1, 1_000);
    await settings.setMonthlyCap(actor(a), 1_000);
    expect((await report.report(a.organizationId)).state).toBe("suspended");
    await expect(report.report(a.organizationId, "novembre")).rejects.toThrow(RangeError);
  });
});
