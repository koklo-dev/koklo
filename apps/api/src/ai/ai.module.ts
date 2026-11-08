import {
  type AiKeyHooks,
  type AiProvider,
  LLM_PROVIDER_IDS,
  type LlmProvider,
} from "@koklo/domain";
import { AiProviderRouter, createSdkProvider, launchCatalog } from "@koklo/llm";
import { Module } from "@nestjs/common";
import { LlmCredentialModule } from "../llm-credential/llm-credential.module.ts";
import { LlmCredentialResolver } from "../llm-credential/llm-credential.resolver.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { AiController } from "./ai.controller.ts";
import { AiService } from "./ai.service.ts";
import { AiCallRunner } from "./ai-call.ts";
import { AuditAiEventSink } from "./ai-event-sink.ts";
import { CredentialKeyHooks } from "./ai-key-hooks.ts";
import { AiLedger } from "./ai-ledger.ts";
import { AiProvidersController } from "./ai-providers.controller.ts";
import { AiProvidersService } from "./ai-providers.service.ts";
import { AiSettingsController } from "./ai-settings.controller.ts";
import { AiSettingsService } from "./ai-settings.service.ts";
import {
  AI_ADAPTERS,
  AI_CATALOG,
  AI_PROVIDER,
  type AiAdapterFactory,
  type AiCatalog,
} from "./ai-tokens.ts";
import { AiUsageReportService } from "./ai-usage-report.service.ts";
import { NONCE_SOURCE, randomNonceSource } from "./nonce.ts";
import { PrismaAiCredentialSource } from "./prisma-ai-credential-source.ts";
import { PrismaAiRoutingStore } from "./prisma-ai-routing-store.ts";
import { PrismaAiUsageMeter } from "./prisma-ai-usage-meter.ts";

/**
 * Adaptateurs de production : un par fournisseur, créé à la demande, choisi par le code (jamais par la
 * configuration). `fetch` global est lu à chaque appel ; aucune option d'URL.
 */
function sdkAdapters(): AiAdapterFactory {
  const adapters = new Map<string, LlmProvider>();
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

/**
 * Propositions de l'IA. `AI_PROVIDER` est le moteur du paquet `@koklo/llm` branché sur les ports Prisma
 * (réglages, compteur mensuel, clés), l'audit et la vie des clés ; le nonce vient de `randomNonceSource`
 * (les tests le remplacent). `AiService` est exporté pour `llmCredential.verify`. `AiProvidersService`,
 * `AiSettingsService` et `AiUsageReportService` servent les routes `/ai/...` (TK-98).
 */
@Module({
  imports: [LlmCredentialModule, SpecReadModule, TrackerModule],
  controllers: [AiController, AiProvidersController, AiSettingsController],
  providers: [
    AiService,
    AiCallRunner,
    AiLedger,
    AiSettingsService,
    AiProvidersService,
    AiUsageReportService,
    PrismaAiRoutingStore,
    PrismaAiUsageMeter,
    AuditAiEventSink,
    CredentialKeyHooks,
    { provide: NONCE_SOURCE, useValue: randomNonceSource },
    { provide: AI_ADAPTERS, useFactory: sdkAdapters },
    { provide: AI_CATALOG, useFactory: (): AiCatalog => launchCatalog() },
    {
      provide: PrismaAiCredentialSource,
      inject: [LlmCredentialResolver],
      useFactory: (resolver: LlmCredentialResolver) => new PrismaAiCredentialSource(resolver),
    },
    {
      provide: AI_PROVIDER,
      inject: [
        PrismaAiRoutingStore,
        PrismaAiCredentialSource,
        PrismaAiUsageMeter,
        AI_CATALOG,
        AuditAiEventSink,
        AI_ADAPTERS,
        CredentialKeyHooks,
      ],
      useFactory: (
        routing: PrismaAiRoutingStore,
        credentials: PrismaAiCredentialSource,
        meter: PrismaAiUsageMeter,
        catalog: AiCatalog,
        events: AuditAiEventSink,
        providerFor: AiAdapterFactory,
        keys: AiKeyHooks,
      ): AiProvider =>
        new AiProviderRouter({ routing, credentials, meter, catalog, events, providerFor, keys }),
    },
  ],
  exports: [AiService, AiCallRunner, PrismaAiRoutingStore, AiSettingsService, AiUsageReportService],
})
export class AiModule {}
