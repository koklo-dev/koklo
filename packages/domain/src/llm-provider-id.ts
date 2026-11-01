/** Fournisseurs LLM pris en charge (BYOK) : liste fermée, source de la colonne `provider` (TK-51). */
export const LLM_PROVIDER_IDS = ["anthropic", "openai", "google"] as const;

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

/** Identifiant du faux déterministe : jamais un fournisseur BYOK, jamais stocké en base. */
export const LLM_TEST_PROVIDER_ID = "fake" as const;

/** Fournisseur effectivement servi : un fournisseur BYOK ou le faux de test. */
export type LlmServingProviderId = LlmProviderId | typeof LLM_TEST_PROVIDER_ID;

export const isLlmProviderId = (_value: unknown): _value is LlmProviderId => {
  throw new Error("non implémenté");
};

export const isLlmServingProviderId = (_value: unknown): _value is LlmServingProviderId => {
  throw new Error("non implémenté");
};
