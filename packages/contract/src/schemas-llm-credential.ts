import { z } from "zod";
import { instantSchema } from "./schemas-tickets.ts";

/**
 * Clés BYOK (0.8.0). Les règles de saisie reproduisent les CHECK SQL de `llm_provider_credentials`
 * et la règle du domaine : la base n'est jamais le premier validateur. Aucun message ne reprend la
 * valeur refusée, et aucune sortie ne porte la clé ni quoi que ce soit qui en dérive.
 */
export const llmProviderSchema = z.enum(["anthropic", "openai", "google"]);

export const LLM_API_KEY_MAX_LENGTH = 512;
export const LLM_MODEL_MAX_LENGTH = 100;

const hasControlCharacter = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });

const apiKeySchema = z
  .string()
  .max(LLM_API_KEY_MAX_LENGTH, `${LLM_API_KEY_MAX_LENGTH} caractères au plus`)
  .refine((value) => value.trim() !== "", "ne peut pas être vide")
  .refine((value) => !hasControlCharacter(value), "ne peut pas contenir de caractère de contrôle");

/** Longueur en points de code (`char_length` de la base), sans « / » ni « .. » (pas de chemin). */
const defaultModelSchema = z
  .string()
  .refine((value) => [...value].length >= 1, "ne peut pas être vide")
  .refine((value) => [...value].length <= LLM_MODEL_MAX_LENGTH, "100 caractères au plus")
  .refine((value) => !value.includes("/") && !value.includes(".."), "ne peut pas contenir / ni ..");

/** Statut public : ni identifiant, ni version de clé, ni indice de la clé (suffixe, longueur…). */
export const llmCredentialStatusSchema = z.object({
  provider: llmProviderSchema,
  defaultModel: z.string().optional(),
  configured: z.literal(true),
  invalid: z.boolean(),
  invalidatedAt: instantSchema.optional(),
  lastUsedAt: instantSchema.optional(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

/** Au plus une clé par fournisseur. */
export const llmCredentialListOutputSchema = z.object({
  items: z.array(llmCredentialStatusSchema).max(llmProviderSchema.options.length),
});

export const llmCredentialSetInputSchema = z.object({
  provider: llmProviderSchema,
  apiKey: apiKeySchema,
  defaultModel: defaultModelSchema.optional(),
});

/** Fournisseur dans le chemin ; l'organisation vient toujours de la session. */
export const llmCredentialProviderInputSchema = z.object({ provider: llmProviderSchema });

export const llmCredentialRemoveOutputSchema = z.object({ removed: z.literal(true) });

export type LlmCredentialStatusOutput = z.output<typeof llmCredentialStatusSchema>;
