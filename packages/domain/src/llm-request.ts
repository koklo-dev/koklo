import { assertWithinBudget, type LlmBudget } from "./llm-budget.ts";
import { isLlmCredential, type LlmCredential } from "./llm-credential.ts";
import { InvalidLlmRequestError, type InvalidLlmRequestReason } from "./llm-errors.ts";
import type { Unvalidated } from "./llm-output.ts";
import { type FramedPrompt, isFramedPrompt } from "./llm-prompt.ts";
import { LlmAbortedError } from "./llm-provider-errors.ts";
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const matches = (pattern: RegExp, value: unknown): boolean =>
  typeof value === "string" && pattern.test(value);

const isValidOutput = (output: unknown): boolean => {
  if (!isRecord(output)) {
    return false;
  }
  if (output.kind === "text") {
    return true;
  }
  return output.kind === "json" && isRecord(output.schema) && !Array.isArray(output.schema);
};

const isValidTemperature = (value: unknown): boolean =>
  value === undefined || (typeof value === "number" && value >= 0 && value <= 2);

const isValidSignal = (value: unknown): boolean =>
  value === undefined || (isRecord(value) && typeof value.aborted === "boolean");

const isValidTrace = (trace: unknown): boolean =>
  isRecord(trace) &&
  matches(LLM_TRACE_PATTERN, trace.purpose) &&
  matches(LLM_TRACE_PATTERN, trace.correlationId);

/** Contrôles de forme dans l'ordre imposé ; le premier échec donne la raison. */
const SHAPE_CHECKS: readonly (readonly [
  InvalidLlmRequestReason,
  (request: LlmRequest) => boolean,
])[] = [
  ["model", (r) => matches(LLM_MODEL_PATTERN, r.model)],
  ["credential", (r) => isLlmCredential(r.credential)],
  ["prompt", (r) => isFramedPrompt(r.prompt)],
  ["output", (r) => isValidOutput(r.output)],
  ["temperature", (r) => isValidTemperature(r.temperature)],
  ["signal", (r) => isValidSignal(r.signal)],
  ["trace", (r) => isValidTrace(r.trace)],
];

/** Garde unique d'un adaptateur avant tout appel réseau (forme, trace, budget, annulation). */
export const assertLlmRequest = (request: LlmRequest): LlmRequest => {
  for (const [reason, isValid] of SHAPE_CHECKS) {
    if (!isValid(request ?? ({} as LlmRequest))) {
      throw new InvalidLlmRequestError(reason);
    }
  }
  assertWithinBudget(request);
  if (request.signal?.aborted) {
    throw new LlmAbortedError({ operation: "complete" });
  }
  return request;
};
