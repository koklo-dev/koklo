import { Module } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import type { AppConfig } from "../config.ts";
import { keyRingOf } from "../crypto/key-ring.ts";
import { APP_CONFIG } from "../database/database.module.ts";
import { LLM_CREDENTIAL_REPOSITORY } from "./llm-credential.repository.ts";
import { LlmCredentialResolver } from "./llm-credential.resolver.ts";
import { LlmCredentialService } from "./llm-credential.service.ts";
import { PrismaLlmCredentialRepository } from "./prisma-llm-credential.repository.ts";

/**
 * Sans porte-clés (`KOKLO_ENCRYPTION_KEY` absente), le service reçoit `null` : `set` répond 503
 * `ENCRYPTION_UNAVAILABLE`, `list`, `remove` et `invalidate` restent disponibles. Le module fournit le
 * service et le résolveur ; les routes sont dans `LlmCredentialRoutesModule` (elles appellent l'IA).
 */
@Module({
  providers: [
    { provide: LLM_CREDENTIAL_REPOSITORY, useClass: PrismaLlmCredentialRepository },
    {
      provide: LlmCredentialService,
      inject: [LLM_CREDENTIAL_REPOSITORY, APP_CONFIG, CLOCK],
      useFactory: (repository: PrismaLlmCredentialRepository, config: AppConfig, clock: Clock) =>
        new LlmCredentialService(repository, keyRingOf(config), clock),
    },
    {
      provide: LlmCredentialResolver,
      inject: [LLM_CREDENTIAL_REPOSITORY, APP_CONFIG],
      useFactory: (repository: PrismaLlmCredentialRepository, config: AppConfig) =>
        new LlmCredentialResolver(repository, keyRingOf(config)),
    },
  ],
  exports: [LlmCredentialService, LlmCredentialResolver],
})
export class LlmCredentialModule {}
