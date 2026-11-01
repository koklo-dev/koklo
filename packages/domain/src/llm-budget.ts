import type { LlmRequest } from "./llm-request.ts";

/** Plafonds du domaine : aucun budget ne peut les dépasser. */
export const LLM_MAX_OUTPUT_TOKENS = 32_000;
export const LLM_MAX_TIMEOUT_MS = 120_000;
export const LLM_MAX_PROMPT_CHARS = 400_000;
/** Coût maximal par appel, en millionièmes de dollar US (5 $). */
export const LLM_MAX_COST_MICRO_USD = 5_000_000;

/** Budget obligatoire de tout appel : aucune valeur implicite côté adaptateur. */
export interface LlmBudget {
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxPromptChars: number;
  readonly maxCostMicroUsd: number;
}

export const assertWithinBudget = (_request: Pick<LlmRequest, "prompt" | "budget">): void => {
  throw new Error("non implémenté");
};
