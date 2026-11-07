import { SdkLlmProvider, type SdkProviderOptions } from "../sdk/sdk-provider.ts";

export type AnthropicProviderOptions = Pick<SdkProviderOptions, "fetch">;

/** Adaptateur Anthropic du port `LlmProvider` : le SDK avec les garanties communes (ADR 0015). */
export class AnthropicProvider extends SdkLlmProvider {
  constructor(options: AnthropicProviderOptions = {}) {
    super("anthropic", options);
  }
}
