/** Taux d'estimation dollars -> euros (B126) : 1 USD = 1 EUR tant qu'aucun taux réel n'est décidé. */
export const AI_COST_EUR_PER_USD = 1;

const MICRO = 1_000_000;
const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Micro-dollars -> « 12,40 € » (l'écran ajoute « ≈ » : c'est une estimation). */
export const formatEuros = (microUsd: number): string =>
  EUROS.format((microUsd / MICRO) * AI_COST_EUR_PER_USD);

/** Euros -> micro-dollars entiers (plafond mensuel). */
export const eurosToMicroUsd = (euros: number): number =>
  Math.round((euros / AI_COST_EUR_PER_USD) * MICRO);

export type CapInput = { ok: true; microUsd: number | null } | { ok: false };

/** Saisie du plafond : vide retire (A1), sinon un montant strictement positif (B62) ; virgule ou point. */
export function parseCapEuros(text: string): CapInput {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return { ok: true, microUsd: null };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false };
  const microUsd = eurosToMicroUsd(Number(trimmed));
  return Number.isSafeInteger(microUsd) && microUsd > 0 ? { ok: true, microUsd } : { ok: false };
}
