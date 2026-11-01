/** Budget obligatoire de toute session d'agent : aucune valeur implicite. */
import type { FramedPrompt } from "@koklo/domain";
import {
  AgentBudgetExceededError,
  type AgentBudgetLimit,
  InvalidAgentBudgetError,
} from "./agent-errors.ts";

/** Plafonds du domaine : aucun budget ne peut les dépasser. */
export const AGENT_MAX_TIMEOUT_MS = 3_600_000;
/** Coût maximal par session, en millionièmes de dollar US (20 $). */
export const AGENT_MAX_COST_MICRO_USD = 20_000_000;
export const AGENT_MAX_OUTPUT_CHARS = 1_000_000;
export const AGENT_MAX_PROMPT_CHARS = 1_000_000;

export interface AgentBudget {
  readonly timeoutMs: number;
  readonly maxCostMicroUsd: number;
  readonly maxOutputChars: number;
  readonly maxPromptChars: number;
}

/** Champs examinés dans cet ordre, avec la limite et le plafond associés. */
const BUDGET_RULES: readonly {
  readonly field: keyof AgentBudget;
  readonly limit: AgentBudgetLimit;
  readonly ceiling: number;
}[] = [
  { field: "timeoutMs", limit: "timeout", ceiling: AGENT_MAX_TIMEOUT_MS },
  { field: "maxCostMicroUsd", limit: "cost", ceiling: AGENT_MAX_COST_MICRO_USD },
  { field: "maxOutputChars", limit: "output-chars", ceiling: AGENT_MAX_OUTPUT_CHARS },
  { field: "maxPromptChars", limit: "prompt-chars", ceiling: AGENT_MAX_PROMPT_CHARS },
];

const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0;

/**
 * Valide le budget (forme, plafonds, taille du prompt) et retourne une copie gelée ; chaque champ
 * est lu une seule fois (anti-TOCTOU).
 */
export const snapshotAgentBudget = (budget: unknown, prompt: FramedPrompt): AgentBudget => {
  if (typeof budget !== "object" || budget === null) {
    throw new InvalidAgentBudgetError("budget");
  }
  const { timeoutMs, maxCostMicroUsd, maxOutputChars, maxPromptChars } = budget as Record<
    string,
    unknown
  >;
  const read = { timeoutMs, maxCostMicroUsd, maxOutputChars, maxPromptChars };
  for (const { field } of BUDGET_RULES) {
    if (!isPositiveInteger(read[field])) {
      throw new InvalidAgentBudgetError(field);
    }
  }
  const checked = read as AgentBudget;
  for (const { field, limit, ceiling } of BUDGET_RULES) {
    if (checked[field] > ceiling) {
      throw new AgentBudgetExceededError(limit);
    }
  }
  if (prompt.system.length + prompt.user.length > checked.maxPromptChars) {
    throw new AgentBudgetExceededError("prompt-chars");
  }
  return Object.freeze(checked);
};

/** Forme (entiers strictement positifs), plafonds du domaine, taille du prompt. */
export const assertAgentBudget = (budget: AgentBudget, prompt: FramedPrompt): void => {
  snapshotAgentBudget(budget, prompt);
};
