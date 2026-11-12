import type { LlmBudget } from "@koklo/domain";

/** Finalités (`trace.purpose`) des appels de la génération de propositions (TK-99a, B314). */
export type ProposalPurpose = "proposal-zones" | "proposal-batch" | "proposal-revise";

const COMMON = { maxPromptChars: 60_000, maxCostMicroUsd: 500_000 } as const;

/**
 * Budget serveur de chaque appel, jamais lu d'une entrée : le worker (zones, une zone par appel) et l'API
 * (révision synchrone) partagent la même table.
 */
export const PROPOSAL_BUDGETS: Readonly<Record<ProposalPurpose, LlmBudget>> = {
  /** Étape 1 : liste des zones du livrable (douze au plus, un titre chacune). */
  "proposal-zones": { maxOutputTokens: 1500, timeoutMs: 60_000, ...COMMON },
  /** Étape 2 : une zone = un appel, jusqu'à 25 propositions. */
  "proposal-batch": { maxOutputTokens: 8000, timeoutMs: 120_000, ...COMMON },
  /** Révision d'une proposition : une proposition entre, une proposition sort. */
  "proposal-revise": { maxOutputTokens: 2500, timeoutMs: 60_000, ...COMMON },
};
