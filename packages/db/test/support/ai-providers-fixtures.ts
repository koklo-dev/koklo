import type { TestDatabase } from "../../src/testing/test-database.ts";

/** Tables ajoutées par TK-95 (lot C) : réglages d'IA, modèle par usage, consommation mensuelle. */
export const AI_TABLES = [
  "ai_organization_settings",
  "ai_usage_models",
  "ai_usage_monthly",
] as const;
export const AI_MODELS = ["AiOrganizationSettings", "AiUsageModel", "AiUsageMonthly"] as const;

export const AI_SUFFIX = "_ai_providers";
export const AI_USAGE_VALUES = [
  "idea_space",
  "spec_deliverables",
  "baseline_summary",
  "ticket_breakdown",
] as const;
export const LLM_PROVIDER_VALUES = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "openrouter",
  "openai_compatible",
] as const;

export const COMPATIBLE_URL = "https://llm.example.org/v1";

export async function insertCredential(
  db: TestDatabase,
  organizationId: string,
  provider: string,
  extra: { baseUrl?: string | null; defaultModel?: string | null; invalidated?: boolean } = {},
): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `INSERT INTO llm_provider_credentials (id, organization_id, provider, ciphertext, nonce,
       key_version, default_model, base_url, invalidated_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2::llm_provider, $3, $4, 1, $5, $6, $7, now(), now())
     RETURNING id`,
    [
      organizationId,
      provider,
      Buffer.alloc(40, 3),
      Buffer.alloc(12, 5),
      extra.defaultModel ?? null,
      extra.baseUrl ?? null,
      extra.invalidated === true ? new Date() : null,
    ],
  );
  return (rows[0] as { id: string }).id;
}

export async function insertSettings(
  db: TestDatabase,
  organizationId: string,
  o: {
    primary?: string | null;
    fallback?: string | null;
    enabled?: boolean;
    cap?: string | number | null;
    warnedMonth?: string | null;
  } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO ai_organization_settings (organization_id, primary_provider, fallback_provider,
       fallback_enabled, monthly_cap_micro_usd, cap_warned_month, created_at, updated_at)
     VALUES ($1, $2::llm_provider, $3::llm_provider, $4, $5, $6::date, now(), now())`,
    [
      organizationId,
      o.primary ?? null,
      o.fallback ?? null,
      o.enabled ?? true,
      o.cap ?? null,
      o.warnedMonth ?? null,
    ],
  );
}

export async function insertUsageModel(
  db: TestDatabase,
  organizationId: string,
  usage: string,
  provider: string,
  model = "claude-sonnet-5-5",
): Promise<void> {
  await db.query(
    `INSERT INTO ai_usage_models (organization_id, usage, provider, model, created_at, updated_at)
     VALUES ($1, $2::ai_usage, $3::llm_provider, $4, now(), now())`,
    [organizationId, usage, provider, model],
  );
}

export async function insertMonthly(
  db: TestDatabase,
  organizationId: string,
  o: {
    month?: string;
    provider?: string;
    calls?: number;
    input?: string | number;
    output?: string | number;
    cost?: string | number;
  } = {},
): Promise<void> {
  await db.query(
    `INSERT INTO ai_usage_monthly (organization_id, month, provider, calls, input_tokens,
       output_tokens, cost_micro_usd, created_at, updated_at)
     VALUES ($1, $2::date, $3::llm_provider, $4, $5, $6, $7, now(), now())`,
    [
      organizationId,
      o.month ?? "2026-11-01",
      o.provider ?? "anthropic",
      o.calls ?? 0,
      o.input ?? 0,
      o.output ?? 0,
      o.cost ?? 0,
    ],
  );
}

/**
 * Enums tels qu'avant TK-95 : `ai_usage` retiré, `llm_provider` ramené à ses trois valeurs d'origine. Sert aux
 * tests des migrations antérieures, qui comparent la base finale à leur état de référence.
 */
export const withoutAiEnums = (enums: readonly string[]): string[] =>
  enums
    .filter((entry) => !entry.startsWith("ai_usage:"))
    .map((entry) =>
      entry.startsWith("llm_provider:") ? "llm_provider:anthropic,openai,google" : entry,
    );
