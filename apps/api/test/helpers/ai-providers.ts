import type { TestDatabase } from "@koklo/db/testing";
import type { INestApplication } from "@nestjs/common";
import type { Actor } from "./organizations.ts";
import { send } from "./tickets.ts";

/** Client HTTP des onze routes `/ai/...` (contrat 2.3.0, TK-98). */
export function providersApi(app: INestApplication, actor: Pick<Actor, "cookie"> | undefined) {
  const cookie = actor?.cookie;
  const path = (provider: string, suffix = "") => `/ai/providers/${provider}${suffix}`;
  return {
    list: () => send(app, cookie, "get", "/ai/providers"),
    add: (body: Record<string, unknown>) => send(app, cookie, "post", "/ai/providers", body),
    verify: (provider: string) =>
      send(app, cookie, "post", path(provider, "/verify"), { provider }),
    replaceKey: (provider: string, body: Record<string, unknown>) =>
      send(app, cookie, "put", path(provider, "/key"), { provider, ...body }),
    remove: (provider: string) => send(app, cookie, "delete", path(provider)),
    setPrimary: (provider: string) =>
      send(app, cookie, "post", path(provider, "/primary"), { provider }),
    models: () => send(app, cookie, "get", "/ai/models"),
    setUsage: (usage: string, body: Record<string, unknown>) =>
      send(app, cookie, "put", `/ai/usages/${usage}`, { usage, ...body }),
    report: (query = "") => send(app, cookie, "get", `/ai/usage${query}`),
    settings: () => send(app, cookie, "get", "/ai/settings"),
    update: (body: Record<string, unknown>) => send(app, cookie, "patch", "/ai/settings", body),
  };
}

/** Une requête par route, avec un corps valide : sert aux matrices de droits et d'origine. */
export const ROUTE_CALLS: Record<
  string,
  (api: ReturnType<typeof providersApi>, key: string) => ReturnType<typeof send>
> = {
  "aiProvider.list": (api) => api.list(),
  "aiProvider.add": (api, key) => api.add({ provider: "openai", apiKey: key }),
  "aiProvider.verify": (api) => api.verify("anthropic"),
  "aiProvider.replaceKey": (api, key) => api.replaceKey("anthropic", { apiKey: key }),
  "aiProvider.remove": (api) => api.remove("anthropic"),
  "aiProvider.setPrimary": (api) => api.setPrimary("anthropic"),
  "aiModel.listQualified": (api) => api.models(),
  "aiUsage.set": (api) => api.setUsage("idea_space", { model: null }),
  "aiUsage.report": (api) => api.report(),
  "aiSettings.get": (api) => api.settings(),
  "aiSettings.update": (api) => api.update({ fallbackEnabled: true }),
};

export interface SettingsRow {
  primary_provider: string | null;
  fallback_provider: string | null;
  fallback_enabled: boolean;
  monthly_cap_micro_usd: string | null;
  cap_warned_month: Date | null;
}

export function settingsRows(database: TestDatabase, organizationId: string) {
  return database.query<SettingsRow>(
    `SELECT primary_provider::text AS primary_provider, fallback_provider::text AS fallback_provider,
            fallback_enabled, monthly_cap_micro_usd::text AS monthly_cap_micro_usd, cap_warned_month
       FROM ai_organization_settings WHERE organization_id = $1`,
    [organizationId],
  );
}

export function usageModelRows(database: TestDatabase, organizationId: string) {
  return database.query<{ usage: string; provider: string; model: string }>(
    `SELECT usage::text AS usage, provider::text AS provider, model FROM ai_usage_models
      WHERE organization_id = $1 ORDER BY usage`,
    [organizationId],
  );
}

export function insertUsage(
  database: TestDatabase,
  organizationId: string,
  row: { month: string; provider: string; calls: number; costMicroUsd: number },
) {
  return database.query(
    `INSERT INTO ai_usage_monthly (organization_id, month, provider, calls, input_tokens, output_tokens, cost_micro_usd, created_at, updated_at)
     VALUES ($1, $2::date, $3::llm_provider, $4, 100, 40, $5, now(), now())`,
    [organizationId, `${row.month}-01`, row.provider, row.calls, row.costMicroUsd],
  );
}

/** Colonnes de la table des clés, sans rien de secret en clair (le chiffré sert à prouver « intact »). */
export function sealedRows(database: TestDatabase, organizationId: string) {
  return database.query<Record<string, unknown>>(
    `SELECT provider::text AS provider, encode(ciphertext, 'hex') AS ct, encode(nonce, 'hex') AS nonce,
            key_version, default_model, base_url, invalidated_at, last_used_at, updated_at
       FROM llm_provider_credentials WHERE organization_id = $1 ORDER BY provider`,
    [organizationId],
  );
}
