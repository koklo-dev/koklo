/** Prix d'un modèle en dollars US par million de tokens (= micro-dollars par token). */
export interface ModelPrice {
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
}

/**
 * Table des prix par modèle, relevée le 2026-10-06 (tarifs publics, API directe). À revalider à
 * chaque changement de grille (NEEDS-HUMAN) : un prix trop bas affaiblit le garde-fou de coût.
 * Haiku 5.5 : tarif au-delà de 100 000 tokens de prompt (le majorant suppose le pire cas).
 */
export const ANTHROPIC_PRICES: Readonly<Record<string, ModelPrice>> = Object.freeze({
  "claude-fable-5-1": { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  "claude-fable-5": { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  "claude-opus-5-5": { inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
  "claude-opus-5": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-opus-4-8": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-opus-4-7": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-opus-4-6": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
  "claude-sonnet-5-5": { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  "claude-sonnet-5": { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  "claude-sonnet-4-6": { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
  "claude-haiku-5-5": { inputUsdPerMTok: 0.5, outputUsdPerMTok: 2.5 },
  "claude-haiku-4-5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
});

const prices = Object.values(ANTHROPIC_PRICES);
const HIGHEST: ModelPrice = {
  inputUsdPerMTok: Math.max(...prices.map((price) => price.inputUsdPerMTok)),
  outputUsdPerMTok: Math.max(...prices.map((price) => price.outputUsdPerMTok)),
};

/** Prix du modèle ; modèle inconnu = maximum composante par composante de la table. */
export const priceOf = (model: string): ModelPrice =>
  Object.hasOwn(ANTHROPIC_PRICES, model) ? (ANTHROPIC_PRICES[model] as ModelPrice) : HIGHEST;

/** Majorant du coût en micro-dollars : 1 token <= 1 caractère en entrée, `maxOutputTokens` en sortie. */
export const costUpperBoundMicroUsd = (
  model: string,
  promptChars: number,
  maxOutputTokens: number,
): number => {
  const { inputUsdPerMTok, outputUsdPerMTok } = priceOf(model);
  return Math.ceil(promptChars * inputUsdPerMTok + maxOutputTokens * outputUsdPerMTok);
};
