import {
  type LlmProvider,
  type LlmProviderId,
  type LlmRequest,
  llmCredential,
} from "@koklo/domain";
import { createSdkProvider, type SdkProviderOptions } from "../../src/index.ts";
import { BUDGET, makeRequest } from "./harness.ts";
import { COMPAT_BASE_URL } from "./sdk-bodies.ts";

export interface Seen {
  readonly url: string;
  readonly init: RequestInit;
}

export type Responder = (seen: Seen) => Response | Promise<Response>;

/** Transport scripté : une réponse par appel, tous les appels enregistrés. */
export const scripted = (...responders: Responder[]) => {
  const calls: Seen[] = [];
  const queue = [...responders];
  const fetch = async (url: string | URL, init: RequestInit = {}): Promise<Response> => {
    const seen = { url: String(url), init };
    calls.push(seen);
    const next = queue.shift();
    if (next === undefined) throw new Error("script épuisé");
    return next(seen);
  };
  return { calls, fetch: fetch as unknown as NonNullable<SdkProviderOptions["fetch"]> };
};

export const PUBLIC_RESOLVER = async (): Promise<readonly string[]> => ["93.184.216.34"];

export const providerFor = (
  id: LlmProviderId,
  fetch: SdkProviderOptions["fetch"],
  extra: Partial<SdkProviderOptions> = {},
): LlmProvider => createSdkProvider(id, { fetch, resolveHost: PUBLIC_RESOLVER, ...extra });

export const requestFor = (id: LlmProviderId, overrides: Partial<LlmRequest> = {}): LlmRequest =>
  makeRequest({
    model: "modele-demande-1",
    credential: llmCredential("cle-de-test-SENTINELLE-9876"),
    budget: { ...BUDGET, maxCostMicroUsd: 5_000_000 },
    ...(id === "openai_compatible" ? { baseUrl: COMPAT_BASE_URL } : {}),
    ...overrides,
  });

export { BUDGET, makeRequest };
