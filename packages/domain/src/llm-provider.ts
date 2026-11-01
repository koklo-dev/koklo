import type { LlmServingProviderId } from "./llm-provider-id.ts";
import type { LlmRequest, LlmResponse } from "./llm-request.ts";

/** Port multi-fournisseurs : une opération, sans état, sans streaming, sans outils. */
export interface LlmProvider {
  readonly id: LlmServingProviderId;
  complete(request: LlmRequest): Promise<LlmResponse>;
}
