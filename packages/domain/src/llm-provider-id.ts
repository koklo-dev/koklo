/** Fournisseurs LLM pris en charge (BYOK) : liste fermée, source de la colonne `provider` (TK-51). */
export const LLM_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "openrouter",
  "openai_compatible",
] as const;

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

/** Identifiant du faux déterministe : jamais un fournisseur BYOK, jamais stocké en base. */
export const LLM_TEST_PROVIDER_ID = "fake" as const;

/** Fournisseur effectivement servi : un fournisseur BYOK ou le faux de test. */
export type LlmServingProviderId = LlmProviderId | typeof LLM_TEST_PROVIDER_ID;

/** Casse exacte, sans passer par le prototype (`"constructor"` et `"__proto__"` sont refusés). */
export const isLlmProviderId = (value: unknown): value is LlmProviderId =>
  (LLM_PROVIDER_IDS as readonly unknown[]).includes(value);

export const isLlmServingProviderId = (value: unknown): value is LlmServingProviderId =>
  value === LLM_TEST_PROVIDER_ID || isLlmProviderId(value);

/** Propriétés des fournisseurs que le moteur et l'écran des fournisseurs (TK-98) lisent. */
export interface LlmProviderTraits {
  /** Le fournisseur relaie vers d'autres : le prompt transite par un tiers de plus. */
  readonly intermediary: boolean;
  /** Utilisable quand l'appel exige des données en UE (question A5 ouverte : lecture prudente). */
  readonly euEligible: boolean;
  /** Une adresse de base est obligatoire (et réservée à ce fournisseur). */
  readonly baseUrlRequired: boolean;
}

const traits = (intermediary: boolean, baseUrlRequired = false): LlmProviderTraits =>
  Object.freeze({ intermediary, euEligible: !intermediary, baseUrlRequired });

export const LLM_PROVIDER_TRAITS: Readonly<Record<LlmProviderId, LlmProviderTraits>> =
  Object.freeze({
    anthropic: traits(false),
    openai: traits(false),
    google: traits(false),
    mistral: traits(false),
    openrouter: traits(true),
    openai_compatible: traits(false, true),
  });

export const llmProviderTraits = (id: LlmProviderId): LlmProviderTraits => LLM_PROVIDER_TRAITS[id];
