import type { LlmProvider, LlmProviderId } from "@koklo/domain";

/**
 * Registre des fournisseurs LLM de l'API (TK-54b) : jeton Nest d'une `Map<LlmProviderId, LlmProvider>`.
 * En production, `LlmModule` n'y met que l'adaptateur Anthropic (`AnthropicProvider`, `fetch` global
 * lu à chaque appel). Le faux du port n'est JAMAIS choisi par la configuration : seuls les
 * tests le placent ici, par `overrideProvider(LLM_PROVIDERS)` (même règle que `GIT_PROVIDER`).
 */
export const LLM_PROVIDERS = Symbol("LLM_PROVIDERS");
export type LlmProviderRegistry = ReadonlyMap<LlmProviderId, LlmProvider>;
