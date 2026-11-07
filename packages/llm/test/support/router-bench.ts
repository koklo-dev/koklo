import {
  type AiKeyHooks,
  type AiRequest,
  type AiRouting,
  type LlmProvider,
  type LlmProviderId,
  type LlmRequest,
  type LlmResponse,
  type QualifiedModel,
  unvalidated,
} from "@koklo/domain";
import { FakeLlm } from "@koklo/domain/testing";
import { AiProviderRouter } from "../../src/index.ts";
import {
  InMemoryCredentialSource,
  InMemoryRoutingStore,
  InMemoryUsageMeter,
  qualifiedCatalog,
  RecordingEvents,
} from "../../src/testing/index.ts";
import { BUDGET, PROMPT } from "./harness.ts";

export const ORG = "org-0001";
export const ALL_PROVIDERS: readonly LlmProviderId[] = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "openrouter",
  "openai_compatible",
];

/** Un modèle qualifié par fournisseur, pour les quatre usages. */
export const CATALOG: readonly QualifiedModel[] = ALL_PROVIDERS.map((provider) => ({
  provider,
  model: provider === "anthropic" ? "claude-sonnet-5-5" : `${provider}-qualifie`.replace("_", "-"),
  usages: ["idea_space", "spec_deliverables", "baseline_summary", "ticket_breakdown"],
  economy: false,
}));

export const REQUEST = (overrides: Partial<AiRequest> = {}): AiRequest => ({
  organizationId: ORG,
  usage: "idea_space",
  euOnly: false,
  prompt: PROMPT,
  output: { kind: "text" },
  budget: BUDGET,
  trace: { purpose: "idea-space", correlationId: "req-0001" },
  ...overrides,
});

export interface BenchOptions {
  readonly routing?: Partial<AiRouting>;
  readonly keys?: readonly LlmProviderId[];
  readonly defaultModels?: Partial<Record<LlmProviderId, string>>;
  readonly baseUrls?: Partial<Record<LlmProviderId, string>>;
  readonly providers?: Partial<Record<LlmProviderId, LlmProvider>>;
  readonly catalog?: readonly QualifiedModel[];
  readonly costMicroUsd?: number;
  readonly warned?: boolean;
  readonly now?: () => Date;
  readonly meter?: InMemoryUsageMeter;
  readonly hooks?: AiKeyHooks;
  readonly revisions?: Partial<Record<LlmProviderId, string>>;
}

export const bench = (options: BenchOptions = {}) => {
  const keys = options.keys ?? ["anthropic", "openai", "mistral", "openrouter"];
  const routing = new InMemoryRoutingStore({
    primary: "anthropic",
    fallback: "openai",
    fallbackEnabled: true,
    usageModels: {},
    availableProviders: keys,
    ...options.routing,
  });
  const credentials = new InMemoryCredentialSource(
    Object.fromEntries(
      keys.map((id) => [
        id,
        {
          secret: `cle-${id}-SENTINELLE`,
          baseUrl: options.baseUrls?.[id],
          defaultModel: options.defaultModels?.[id],
          revision: options.revisions?.[id],
        },
      ]),
    ),
  );
  const meter =
    options.meter ??
    new InMemoryUsageMeter({
      costMicroUsd: options.costMicroUsd,
      warned: options.warned,
      now: options.now,
    });
  const events = new RecordingEvents();
  const fakes = Object.fromEntries(
    ALL_PROVIDERS.map((id) => [id, options.providers?.[id] ?? FakeLlm.replying("réponse")]),
  ) as Record<LlmProviderId, LlmProvider>;
  const router = new AiProviderRouter({
    routing,
    credentials,
    meter,
    catalog: qualifiedCatalog(options.catalog ?? CATALOG),
    events,
    providerFor: (id) => fakes[id],
    ...(options.hooks === undefined ? {} : { keys: options.hooks }),
  });
  return { router, routing, credentials, meter, events, fakes };
};

/** Fournisseur espion : garde la requête reçue et rend une réponse fixe. */
export const spy = (reply: Partial<LlmResponse> = {}) => {
  const requests: LlmRequest[] = [];
  const provider: LlmProvider = {
    id: "fake",
    complete: async (request) => {
      requests.push(request);
      return {
        output: unvalidated("réponse"),
        stop: "end",
        usage: { inputTokens: 100, outputTokens: 50 },
        provider: "fake",
        model: request.model,
        ...reply,
      };
    },
    stream: async function* () {},
  };
  return { provider, requests };
};

export const drain = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
};

/** Fournisseur qui lève toujours cette instance d'erreur (identité conservée) et garde ses appels. */
export const throwing = (error: Error) => {
  const calls: LlmRequest[] = [];
  const provider: LlmProvider & { readonly calls: LlmRequest[] } = {
    id: "fake",
    calls,
    complete: async (request) => {
      calls.push(request);
      throw error;
    },
    stream: (request) => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          calls.push(request);
          throw error;
        },
      }),
    }),
  };
  return provider;
};
