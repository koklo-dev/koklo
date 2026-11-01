import type { LlmServingProviderId } from "./llm-provider-id.ts";

export const LLM_PROVIDER_ERROR_NAMES = [
  "LlmAuthError",
  "LlmRateLimitedError",
  "LlmQuotaExceededError",
  "LlmTimeoutError",
  "LlmAbortedError",
  "LlmBudgetExceededError",
  "LlmContextTooLongError",
  "LlmRefusedError",
  "LlmModelNotFoundError",
  "LlmProviderUnavailableError",
  "LlmInvalidOutputError",
] as const;

export type LlmProviderErrorName = (typeof LLM_PROVIDER_ERROR_NAMES)[number];

export interface LlmErrorDiagnostic {
  readonly operation: string;
  readonly provider?: LlmServingProviderId;
  readonly status?: number;
}

export const LLM_BUDGET_LIMITS = ["output-tokens", "timeout", "cost", "prompt-chars"] as const;
export type LlmBudgetLimit = (typeof LLM_BUDGET_LIMITS)[number];

/** Racine des erreurs du port LLM ; aucune ne porte clé, prompt, sortie ni `cause`. */
export class LlmProviderError extends Error {
  readonly operation!: string;
  declare readonly provider?: LlmServingProviderId;
  declare readonly status?: number;
  constructor(_diagnostic: LlmErrorDiagnostic, _message?: string) {
    super();
    throw new Error("non implémenté");
  }
}

export class LlmAuthError extends LlmProviderError {}
export class LlmRateLimitedError extends LlmProviderError {
  readonly retryAfterMs!: number;
  constructor(_input: LlmErrorDiagnostic & { retryAfterMs: number }) {
    super(_input);
  }
}
export class LlmQuotaExceededError extends LlmProviderError {}
export class LlmTimeoutError extends LlmProviderError {}
export class LlmAbortedError extends LlmProviderError {}
export class LlmBudgetExceededError extends LlmProviderError {
  readonly limit!: LlmBudgetLimit;
  constructor(_input: LlmErrorDiagnostic & { limit: LlmBudgetLimit }) {
    super(_input);
  }
}
export class LlmContextTooLongError extends LlmProviderError {}
export class LlmRefusedError extends LlmProviderError {}
export class LlmModelNotFoundError extends LlmProviderError {}
export class LlmProviderUnavailableError extends LlmProviderError {}
