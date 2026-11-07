import { assertWithinBudget, type LlmBudget } from "./llm-budget.ts";
import { isLlmCredential, type LlmCredential } from "./llm-credential.ts";
import { InvalidLlmRequestError, type InvalidLlmRequestReason } from "./llm-errors.ts";
import type { Unvalidated } from "./llm-output.ts";
import { isPlainJson } from "./llm-plain-json.ts";
import { type FramedPrompt, isFramedPrompt } from "./llm-prompt.ts";
import { LlmAbortedError } from "./llm-provider-errors.ts";
import type { LlmServingProviderId } from "./llm-provider-id.ts";

/** Trace de journalisation : jamais de contenu (`/^[A-Za-z0-9._:-]{1,64}$/`). */
export const LLM_TRACE_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
/**
 * Un modèle n'est jamais un chemin (TK-50c) : pas de `..`, pas de `/` initial ou final, au plus un
 * `/` entre deux segments (`fournisseur/modèle` des intermédiaires, TK-95). Les adaptateurs dont le
 * modèle entre dans l'URL refusent tout `/`.
 */
export const LLM_MODEL_PATTERN = /^(?!.*\.\.)(?=.{1,128}$)[A-Za-z0-9._:-]+(?:\/[A-Za-z0-9._:-]+)?$/;

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
  /** Adresse de base d'un point d'accès compatible ; contrôlée par l'adaptateur (anti-SSRF). */
  readonly baseUrl?: string;
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

/** Longueur maximale d'une adresse de base acceptée. */
export const LLM_BASE_URL_MAX_LENGTH = 2048;

const isValidBaseUrl = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === "string" && value.length > 0 && value.length <= LLM_BASE_URL_MAX_LENGTH);

const isValidTemperature = (value: unknown): boolean =>
  value === undefined || (typeof value === "number" && value >= 0 && value <= 2);

const isValidSignal = (value: unknown): boolean =>
  value === undefined || value instanceof AbortSignal;

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
  ["baseUrl", (r) => isValidBaseUrl(r.baseUrl)],
];

/** Lit chaque champ une seule fois (un accesseur ne peut pas répondre autrement à une 2e lecture). */
const readFields = (request: LlmRequest): LlmRequest => {
  const source = (request ?? {}) as Partial<LlmRequest>;
  const { output, budget, trace } = source;
  return {
    model: source.model,
    credential: source.credential,
    prompt: source.prompt,
    output: isRecord(output)
      ? { kind: output.kind, schema: (output as { schema?: unknown }).schema }
      : output,
    budget: isRecord(budget)
      ? {
          maxOutputTokens: budget.maxOutputTokens,
          timeoutMs: budget.timeoutMs,
          maxPromptChars: budget.maxPromptChars,
          maxCostMicroUsd: budget.maxCostMicroUsd,
        }
      : budget,
    baseUrl: source.baseUrl,
    temperature: source.temperature,
    signal: source.signal,
    trace: isRecord(trace) ? { purpose: trace.purpose, correlationId: trace.correlationId } : trace,
  } as LlmRequest;
};

const deepFreeze = <T>(value: T): T => {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/** Copie gelée de la sortie : le schéma est cloné (une valeur non clonable est refusée). */
const freezeOutput = (output: LlmOutputSpec): LlmOutputSpec => {
  if (output.kind === "text") {
    return Object.freeze({ kind: "text" });
  }
  try {
    if (isPlainJson(output.schema)) {
      return deepFreeze({ kind: "json", schema: structuredClone(output.schema) });
    }
  } catch {
    // une valeur non clonable est refusée comme une valeur qui n'est pas du JSON
  }
  throw new InvalidLlmRequestError("output");
};

const snapshotOf = (read: LlmRequest): LlmRequest => {
  const { temperature, signal, baseUrl } = read;
  return Object.freeze({
    model: read.model,
    credential: read.credential,
    prompt: read.prompt,
    output: freezeOutput(read.output),
    budget: Object.freeze({ ...read.budget }),
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(signal === undefined ? {} : { signal }),
    trace: Object.freeze({ ...read.trace }),
  });
};

/**
 * Garde unique d'un adaptateur avant tout appel réseau (forme, trace, budget, annulation).
 * Retourne un instantané gelé en profondeur, chaque champ lu une seule fois : l'adaptateur n'utilise
 * que cet instantané, jamais la requête d'origine (TOCTOU, TK-50c).
 */
export const assertLlmRequest = (
  request: LlmRequest,
  operation: "complete" | "stream" = "complete",
): LlmRequest => {
  const read = readFields(request);
  for (const [reason, isValid] of SHAPE_CHECKS) {
    if (!isValid(read)) {
      throw new InvalidLlmRequestError(reason);
    }
  }
  assertWithinBudget(read);
  if (read.signal?.aborted) {
    throw new LlmAbortedError({ operation });
  }
  return snapshotOf(read);
};
