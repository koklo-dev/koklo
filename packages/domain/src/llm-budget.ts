import { InvalidLlmBudgetError } from "./llm-errors.ts";
import { LlmBudgetExceededError, type LlmBudgetLimit } from "./llm-provider-errors.ts";
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

type BudgetField = keyof LlmBudget;

/** Champs examinés dans cet ordre, avec la limite et le plafond associés. */
const BUDGET_RULES: readonly {
  readonly field: BudgetField;
  readonly limit: LlmBudgetLimit;
  readonly ceiling: number;
}[] = [
  { field: "maxOutputTokens", limit: "output-tokens", ceiling: LLM_MAX_OUTPUT_TOKENS },
  { field: "timeoutMs", limit: "timeout", ceiling: LLM_MAX_TIMEOUT_MS },
  { field: "maxCostMicroUsd", limit: "cost", ceiling: LLM_MAX_COST_MICRO_USD },
  { field: "maxPromptChars", limit: "prompt-chars", ceiling: LLM_MAX_PROMPT_CHARS },
];

const isPositiveInteger = (value: unknown): boolean => Number.isInteger(value) && Number(value) > 0;

const exceeded = (limit: LlmBudgetLimit): LlmBudgetExceededError =>
  new LlmBudgetExceededError({ operation: "complete", limit });

/** Vérifie le budget d'une requête avant tout appel réseau (forme, plafonds, taille du prompt). */
export const assertWithinBudget = ({
  prompt,
  budget,
}: Pick<LlmRequest, "prompt" | "budget">): void => {
  if (typeof budget !== "object" || budget === null) {
    throw new InvalidLlmBudgetError("budget");
  }
  for (const field of [
    "maxOutputTokens",
    "timeoutMs",
    "maxPromptChars",
    "maxCostMicroUsd",
  ] as const) {
    if (!isPositiveInteger(budget[field])) {
      throw new InvalidLlmBudgetError(field);
    }
  }
  for (const { field, limit, ceiling } of BUDGET_RULES) {
    if (budget[field] > ceiling) {
      throw exceeded(limit);
    }
  }
  if (prompt.system.length + prompt.user.length > budget.maxPromptChars) {
    throw exceeded("prompt-chars");
  }
};
