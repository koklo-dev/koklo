import {
  LLM_MODEL_PATTERN,
  LlmRefusedError,
  type LlmStopReason,
  type LlmUsage,
} from "@koklo/domain";
import { diagnosticOf, type ErrorContext, unavailable } from "../common/diagnostic.ts";

export interface FinishInfo {
  readonly finishReason: string;
  readonly rawFinishReason?: string | undefined;
}

/** Refus du modèle : `refusal` (Anthropic) ou filtre de contenu (autres). */
const isRefusal = ({ finishReason, rawFinishReason }: FinishInfo): boolean =>
  finishReason === "content-filter" || rawFinishReason === "refusal";

/** Raison d'arrêt du port ; un refus devient `LlmRefusedError`, toute autre raison inconnue est inutilisable. */
export const stopOf = (finish: FinishInfo, context: ErrorContext): LlmStopReason => {
  if (isRefusal(finish)) {
    throw new LlmRefusedError(diagnosticOf(context));
  }
  if (finish.rawFinishReason === "stop_sequence") {
    return "stop-sequence";
  }
  if (finish.finishReason === "stop") {
    return "end";
  }
  if (finish.finishReason === "length") {
    return "max-tokens";
  }
  throw unavailable(context);
};

const count = (value: number | undefined): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export const usageOf = (usage: {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
}): LlmUsage => ({
  inputTokens: count(usage.inputTokens),
  outputTokens: count(usage.outputTokens),
});

/** Modèle réellement servi ; hors motif, la réponse est inutilisable. */
export const servedModelOf = (model: unknown, context: ErrorContext): string => {
  if (typeof model !== "string" || !LLM_MODEL_PATTERN.test(model)) {
    throw unavailable(context);
  }
  return model;
};
