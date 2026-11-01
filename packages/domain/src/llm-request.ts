import type { LlmBudget } from "./llm-budget.ts";
import type { LlmCredential } from "./llm-credential.ts";
import type { Unvalidated } from "./llm-output.ts";
import type { FramedPrompt } from "./llm-prompt.ts";
import type { LlmServingProviderId } from "./llm-provider-id.ts";

/** Trace de journalisation : jamais de contenu (`/^[A-Za-z0-9._:-]{1,64}$/`). */
export const LLM_TRACE_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
export const LLM_MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,128}$/;

export interface LlmTrace {
  readonly purpose: string;
  readonly correlationId: string;
}

export type LlmOutputSpec =
  | { readonly kind: "text" }
  | { readonly kind: "json"; readonly schema: Readonly<Record<string, unknown>> };

export interface LlmRequest {
  readonly model: string;
  readonly credential: LlmCredential;
  readonly prompt: FramedPrompt;
  readonly output: LlmOutputSpec;
  readonly budget: LlmBudget;
  readonly temperature?: number;
  readonly signal?: AbortSignal;
  readonly trace: LlmTrace;
}

export const LLM_STOP_REASONS = ["end", "max-tokens", "stop-sequence", "refusal"] as const;
export type LlmStopReason = (typeof LLM_STOP_REASONS)[number];

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmResponse {
  readonly output: Unvalidated<unknown>;
  readonly stop: LlmStopReason;
  readonly usage: LlmUsage;
  readonly provider: LlmServingProviderId;
  readonly model: string;
}

/** Garde unique d'un adaptateur avant tout appel réseau (forme, trace, budget, annulation). */
export const assertLlmRequest = (_request: LlmRequest): void => {
  throw new Error("non implémenté");
};
