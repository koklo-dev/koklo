import type { LlmProvider, LlmRequest, LlmResponse } from "@koklo/domain";
import type { FetchLike } from "./fetch-like.ts";

export interface AnthropicProviderOptions {
  /** Transport injectable ; par défaut `globalThis.fetch`, lu à chaque appel. Aucune URL ici. */
  readonly fetch?: FetchLike;
}

/** Adaptateur Anthropic du port `LlmProvider` (fetch direct, sans SDK, TK-54 D2). */
export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic" as const;

  readonly #fetch: FetchLike | undefined;

  constructor(options: AnthropicProviderOptions = {}) {
    this.#fetch = options.fetch;
  }

  complete(_request: LlmRequest): Promise<LlmResponse> {
    void this.#fetch;
    return Promise.reject(new Error("not implemented"));
  }
}
