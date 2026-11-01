/** Prix d'un modèle en dollars US par million de tokens (= micro-dollars par token). */
export interface ModelPrice {
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
}

/** Table datée des prix par modèle ; à remplir au Green (revue périodique, NEEDS-HUMAN). */
export const ANTHROPIC_PRICES: Readonly<Record<string, ModelPrice>> = Object.freeze({});

/** Prix du modèle ; modèle inconnu = maximum composante par composante de la table. */
export const priceOf = (_model: string): ModelPrice => {
  throw new Error("not implemented");
};

/** Majorant du coût en micro-dollars : 1 token <= 1 caractère en entrée, `maxOutputTokens` en sortie. */
export const costUpperBoundMicroUsd = (
  _model: string,
  _promptChars: number,
  _maxOutputTokens: number,
): number => {
  throw new Error("not implemented");
};
