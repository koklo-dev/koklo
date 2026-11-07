/** Usages d'IA du produit : liste fermée ; un appelant donne un usage, jamais un fournisseur (TK-95). */
export const AI_USAGES = [
  "idea_space",
  "spec_deliverables",
  "baseline_summary",
  "ticket_breakdown",
] as const;

export type AiUsage = (typeof AI_USAGES)[number];

/** Casse exacte, sans passer par le prototype. */
export const isAiUsage = (value: unknown): value is AiUsage =>
  (AI_USAGES as readonly unknown[]).includes(value);
