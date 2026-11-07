import { z } from "zod";
import {
  apiKeySchema,
  LLM_BASE_URL_MAX_LENGTH,
  llmProviderSchema,
} from "./schemas-llm-credential.ts";
import { instantSchema } from "./schemas-tickets.ts";

/**
 * Écran des fournisseurs d'IA (2.3.0, TK-98). Aucune sortie ne porte la clé, l'adresse de base ni quoi
 * que ce soit qui en dérive ; aucun message ne reprend une valeur saisie.
 */
export const aiUsageSchema = z.enum([
  "idea_space",
  "spec_deliverables",
  "baseline_summary",
  "ticket_breakdown",
]);

/** Même règle que `LLM_MODEL_PATTERN` du domaine : un seul « / » permis (OpenRouter), jamais « .. ». */
export const AI_MODEL_PATTERN = /^(?!.*\.\.)(?=.{1,128}$)[A-Za-z0-9._:-]+(?:\/[A-Za-z0-9._:-]+)?$/;
const aiModelSchema = z.string().regex(AI_MODEL_PATTERN, "modèle : format invalide");

const baseUrlSchema = z.string().min(1).max(LLM_BASE_URL_MAX_LENGTH);

export const aiProviderRoleSchema = z.enum(["primary", "fallback"]);
export const aiProviderStatusSchema = z.enum(["verified", "unverified", "invalid"]);

export const aiProviderItemSchema = z.object({
  provider: llmProviderSchema,
  role: aiProviderRoleSchema.nullable(),
  status: aiProviderStatusSchema,
  lastUsedAt: instantSchema.optional(),
  defaultModel: z.string().optional(),
  /** « Intermédiaire » à l'écran : le prompt transite par un tiers de plus. */
  intermediary: z.boolean(),
  euEligible: z.boolean(),
  baseUrlRequired: z.boolean(),
});

export const aiProviderListOutputSchema = z.object({
  items: z.array(aiProviderItemSchema).max(llmProviderSchema.options.length),
});

export const aiProviderAddInputSchema = z.object({
  provider: llmProviderSchema,
  apiKey: apiKeySchema,
  baseUrl: baseUrlSchema.optional(),
  model: aiModelSchema.optional(),
});

export const aiProviderPathInputSchema = z.object({ provider: llmProviderSchema });

export const aiProviderReplaceKeyInputSchema = z.object({
  provider: llmProviderSchema,
  apiKey: apiKeySchema,
  baseUrl: baseUrlSchema.optional(),
  model: aiModelSchema.optional(),
});

export const aiProviderVerifyOutputSchema = z.object({
  ok: z.literal(true),
  model: z.string(),
  checkedAt: instantSchema,
});

export const aiProviderRemoveOutputSchema = z.object({ removed: z.literal(true) });

export const aiQualifiedModelSchema = z.object({
  provider: llmProviderSchema,
  model: z.string(),
  usages: z.array(aiUsageSchema),
  economy: z.boolean(),
});

export const aiModelListOutputSchema = z.object({ items: z.array(aiQualifiedModelSchema) });

/** `{ provider, model }` choisit un modèle qualifié ; `{ model: null }` revient au modèle par défaut. */
export const aiUsageSetInputSchema = z
  .object({
    usage: aiUsageSchema,
    provider: llmProviderSchema.optional(),
    model: aiModelSchema.nullable(),
  })
  .refine((value) => (value.model === null) === (value.provider === undefined), {
    message: "fournisseur et modèle vont ensemble",
    path: ["provider"],
  });

export const aiUsageSetOutputSchema = z.object({
  usage: aiUsageSchema,
  provider: llmProviderSchema.optional(),
  model: z.string().optional(),
  isDefault: z.boolean(),
});

const microUsdSchema = z.number().int().nonnegative();
export const aiCapStateSchema = z.enum(["ok", "warning", "suspended"]);

export const aiUsageReportInputSchema = z.object({
  /** Mois UTC, `AAAA-MM` ; le mois courant par défaut. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "mois attendu au format AAAA-MM")
    .optional(),
});

export const aiUsageReportOutputSchema = z.object({
  month: z.string(),
  providers: z.array(
    z.object({
      provider: llmProviderSchema,
      calls: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      costMicroUsd: microUsdSchema,
    }),
  ),
  totalCostMicroUsd: microUsdSchema,
  monthlyCapMicroUsd: microUsdSchema.optional(),
  /** Nommé `capState` : `state` est réservé (liste de noms interdits de `no-secrets`). */
  capState: aiCapStateSchema,
});

export const aiSettingsGetOutputSchema = z.object({
  fallbackEnabled: z.boolean(),
  monthlyCapMicroUsd: microUsdSchema.optional(),
  usages: z.array(aiUsageSetOutputSchema),
});

/** `null` retire (secours, plafond) ; absent ne touche pas. Plafond : entier strictement positif (B62). */
export const aiSettingsUpdateInputSchema = z.object({
  fallback: llmProviderSchema.nullable().optional(),
  fallbackEnabled: z.boolean().optional(),
  monthlyCapMicroUsd: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .optional(),
});

export type AiProviderItemOutput = z.output<typeof aiProviderItemSchema>;
