/** Fournisseurs LLM pris en charge (BYOK) : liste fermée, source de la colonne `provider` (TK-51). */
export const LLM_PROVIDER_IDS = ["anthropic", "openai", "google"] as const;

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
