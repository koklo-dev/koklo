import type { LlmServingProviderId } from "./llm-provider-id.ts";
import type { LlmRequest, LlmResponse, LlmStopReason, LlmUsage } from "./llm-request.ts";

/** Événement d'un flux de texte : des morceaux `text`, puis un seul `end`. */
export type LlmStreamEvent =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "end";
      readonly stop: LlmStopReason;
      readonly usage: LlmUsage;
      readonly provider: LlmServingProviderId;
      readonly model: string;
    };

/** Port multi-fournisseurs : sans état, sans outils ; `stream` ne rend que du texte (jamais du JSON). */
export interface LlmProvider {
  readonly id: LlmServingProviderId;
  complete(request: LlmRequest): Promise<LlmResponse>;
  /** Mêmes gardes que `complete` (levées à la première lecture) ; sortie `json` refusée. */
  stream(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}
