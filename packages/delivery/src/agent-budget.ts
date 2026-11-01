/** Budget obligatoire de toute session d'agent : aucune valeur implicite. */
import type { FramedPrompt } from "@koklo/domain";

export const AGENT_MAX_TIMEOUT_MS = 0;
export const AGENT_MAX_COST_MICRO_USD = 0;
export const AGENT_MAX_OUTPUT_CHARS = 0;
export const AGENT_MAX_PROMPT_CHARS = 0;

export interface AgentBudget {
  readonly timeoutMs: number;
  readonly maxCostMicroUsd: number;
  readonly maxOutputChars: number;
  readonly maxPromptChars: number;
}

/** Forme (entiers strictement positifs), plafonds du domaine, taille du prompt. */
export const assertAgentBudget = (_budget: AgentBudget, _prompt: FramedPrompt): void => {
  throw new Error("not implemented");
};
