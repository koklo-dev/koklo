import type { LlmProviderId, LlmUsage } from "@koklo/domain";
import { HIGHEST_PRICE, type ModelPrice, priceOf } from "../anthropic/anthropic-pricing.ts";

const NO_PRICE: ModelPrice = Object.freeze({ inputUsdPerMTok: 0, outputUsdPerMTok: 0 });

/**
 * Tarif d'un modèle chez un fournisseur. Anthropic : table relevée (ADR 0015). Point d'accès
 * compatible : 0, le prix est saisi par l'organisation (B48). Autres fournisseurs : la grille n'est
 * pas relevée, donc le pire tarif connu (jamais 0) tant qu'elle n'est pas revalidée (NEEDS-HUMAN).
 */
export const priceFor = (provider: LlmProviderId, model: string): ModelPrice => {
  if (provider === "anthropic") {
    return priceOf(model);
  }
  return provider === "openai_compatible" ? NO_PRICE : HIGHEST_PRICE;
};

/** Majorant du coût en micro-dollars avant l'appel : 1 token <= 1 caractère en entrée. */
export const costUpperBoundFor = (
  provider: LlmProviderId,
  model: string,
  promptChars: number,
  maxOutputTokens: number,
): number => {
  const { inputUsdPerMTok, outputUsdPerMTok } = priceFor(provider, model);
  return Math.ceil(promptChars * inputUsdPerMTok + maxOutputTokens * outputUsdPerMTok);
};

/** Coût réel en micro-dollars : tarif x jetons réels, arrondi au-dessus. */
export const actualCostMicroUsd = (
  provider: LlmProviderId,
  model: string,
  usage: LlmUsage,
): number => {
  const { inputUsdPerMTok, outputUsdPerMTok } = priceFor(provider, model);
  return Math.ceil(usage.inputTokens * inputUsdPerMTok + usage.outputTokens * outputUsdPerMTok);
};
