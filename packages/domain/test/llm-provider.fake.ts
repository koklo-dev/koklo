import { type LlmProvider, type LlmRequest, type LlmResponse, unvalidated } from "../src/index.ts";

/**
 * Faux minimal : sa compilation prouve la forme du port (propriété `id`, méthode `complete`).
 * Le vrai faux déterministe (`FakeLlm`) est livré par TK-50c.
 */
export const minimalProvider: LlmProvider = {
  id: "fake",
  complete: async (request: LlmRequest): Promise<LlmResponse> => ({
    output: unvalidated(request.output.kind === "text" ? "ok" : { ok: true }),
    stop: "end",
    usage: { inputTokens: 1, outputTokens: 1 },
    provider: "fake",
    model: request.model,
  }),
};
