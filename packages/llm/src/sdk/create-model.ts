import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LlmProviderId } from "@koklo/domain";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { PROVIDER_BASE_URLS } from "../common/provider-urls.ts";

/** Réglages communs : clé et adresse toujours passées (le SDK ne lit alors aucune variable d'environnement). */
export interface ModelSettings {
  readonly apiKey: string;
  /** Obligatoire pour `openai_compatible`, ignorée sinon (adresse constante). */
  readonly baseUrl?: string;
  readonly fetch: typeof fetch;
}

type ModelFactory = (settings: ModelSettings) => (model: string) => LanguageModel;

const FIXED = PROVIDER_BASE_URLS;

const FACTORIES: Readonly<Record<LlmProviderId, ModelFactory>> = {
  anthropic: (s) => createAnthropic({ apiKey: s.apiKey, baseURL: FIXED.anthropic, fetch: s.fetch }),
  openai: (s) => createOpenAI({ apiKey: s.apiKey, baseURL: FIXED.openai, fetch: s.fetch }).chat,
  google: (s) =>
    createGoogleGenerativeAI({ apiKey: s.apiKey, baseURL: FIXED.google, fetch: s.fetch }),
  mistral: (s) => createMistral({ apiKey: s.apiKey, baseURL: FIXED.mistral, fetch: s.fetch }),
  openrouter: (s) =>
    createOpenRouter({ apiKey: s.apiKey, baseURL: FIXED.openrouter, fetch: s.fetch }).chat,
  openai_compatible: (s) =>
    createOpenAICompatible({
      name: "openai-compatible",
      apiKey: s.apiKey,
      baseURL: s.baseUrl ?? "",
      fetch: s.fetch,
    }),
};

/** Modèle du SDK pour ce fournisseur. */
export const createModel = (
  provider: LlmProviderId,
  settings: ModelSettings,
  model: string,
): LanguageModel => FACTORIES[provider](settings)(model);
