import {
  LLM_MODEL_PATTERN,
  LlmInvalidOutputError,
  type LlmOutputSpec,
  LlmRefusedError,
  type LlmResponse,
  type LlmStopReason,
  type LlmUsage,
  unvalidated,
} from "@koklo/domain";
import { diagnosticOf, unavailable } from "./diagnostic.ts";

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const STOP_REASONS: Readonly<Record<string, LlmStopReason>> = Object.freeze({
  end_turn: "end",
  max_tokens: "max-tokens",
  stop_sequence: "stop-sequence",
});

/** `refusal` devient une erreur ; toute autre raison inconnue ou absente rend la réponse inutilisable. */
const stopOf = (reason: unknown): LlmStopReason => {
  if (reason === "refusal") {
    throw new LlmRefusedError(diagnosticOf());
  }
  if (typeof reason === "string" && Object.hasOwn(STOP_REASONS, reason)) {
    return STOP_REASONS[reason] as LlmStopReason;
  }
  throw unavailable();
};

/** Concatène les blocs texte ; aucun autre bloc n'est toléré (aucun outil n'est jamais demandé). */
const textOf = (content: unknown): string => {
  if (!Array.isArray(content)) {
    throw unavailable();
  }
  return content
    .map((block: unknown) => {
      if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") {
        throw unavailable();
      }
      return block.text;
    })
    .join("");
};

const count = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

const usageOf = (usage: unknown): LlmUsage => {
  const fields = isRecord(usage) ? usage : {};
  return { inputTokens: count(fields.input_tokens), outputTokens: count(fields.output_tokens) };
};

const servedModelOf = (model: unknown): string => {
  if (typeof model !== "string" || !LLM_MODEL_PATTERN.test(model)) {
    throw unavailable();
  }
  return model;
};

/** Sortie non validée : le texte tel quel, ou son analyse JSON (échec sans reprendre le texte). */
const outputOf = (text: string, spec: LlmOutputSpec): unknown => {
  if (spec.kind === "text") {
    return unvalidated(text);
  }
  try {
    return unvalidated(JSON.parse(text) as unknown);
  } catch {
    throw new LlmInvalidOutputError("shape");
  }
};

/** Réponse 200 de `POST /v1/messages` vers la réponse du port ; jamais de sortie `Validated`. */
export const parseMessage = (bodyText: string, spec: LlmOutputSpec): LlmResponse => {
  let message: unknown;
  try {
    message = JSON.parse(bodyText);
  } catch {
    throw unavailable();
  }
  if (!isRecord(message)) {
    throw unavailable();
  }
  const stop = stopOf(message.stop_reason);
  const model = servedModelOf(message.model);
  const text = textOf(message.content);
  return {
    output: outputOf(text, spec) as LlmResponse["output"],
    stop,
    usage: usageOf(message.usage),
    provider: "anthropic",
    model,
  };
};
