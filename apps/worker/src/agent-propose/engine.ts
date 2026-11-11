import {
  AiUsageMeterStore,
  LlmCredentialLookupStore,
  RoutingSettingsStore,
  type TenantClient,
} from "@koklo/db";
import {
  type AiEventSink,
  type AiProvider,
  LLM_PROVIDER_IDS,
  type LlmProvider,
  type LlmProviderId,
} from "@koklo/domain";
import {
  AiProviderRouter,
  type CredentialCipher,
  createSdkProvider,
  LlmCredentialResolver,
  launchCatalog,
  ResolverCredentialSource,
} from "@koklo/llm";
import type { Logger } from "@koklo/observability";

/** Un adaptateur par fournisseur, créé à la demande, choisi par le code (jamais par la configuration). */
function sdkAdapters(): (provider: LlmProviderId) => LlmProvider {
  const adapters = new Map<LlmProviderId, LlmProvider>();
  return (provider) => {
    if (!LLM_PROVIDER_IDS.includes(provider)) throw new RangeError("fournisseur inconnu");
    let adapter = adapters.get(provider);
    if (adapter === undefined) {
      adapter = createSdkProvider(provider);
      adapters.set(provider, adapter);
    }
    return adapter;
  };
}

/** Événements du moteur (bascule, plafond proche) : journal sans contenu ; l'audit reste celui de l'API. */
const loggedEvents = (logger: Logger): AiEventSink => ({
  emit: (event) =>
    logger.info(
      { event: event.type, usage: "usage" in event ? event.usage : undefined },
      "ai event",
    ),
});

/**
 * Moteur d'IA du worker (ADR 0021) : le même `AiProviderRouter` que l'API (TK-95), branché sur les magasins de
 * `@koklo/db` (réglages, compteur mensuel, clés) et le résolveur de `@koklo/llm`. Les appels du worker sont donc
 * mesurés par le compteur mensuel de l'organisation, et le plafond s'y applique. Sans porte-clés (`cipher` nul),
 * aucune clé ne se déchiffre : le moteur refuse en `llm_not_configured`.
 */
export function createAiEngine(deps: {
  client: TenantClient;
  cipher: CredentialCipher | null;
  logger: Logger;
}): AiProvider {
  const resolver = new LlmCredentialResolver(
    new LlmCredentialLookupStore(deps.client),
    deps.cipher,
  );
  return new AiProviderRouter({
    routing: new RoutingSettingsStore(deps.client),
    credentials: new ResolverCredentialSource(resolver),
    meter: new AiUsageMeterStore(deps.client),
    catalog: launchCatalog(),
    events: loggedEvents(deps.logger),
    providerFor: sdkAdapters(),
  });
}
