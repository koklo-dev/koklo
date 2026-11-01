import { Module } from "@nestjs/common";
import { LlmModule } from "../llm/llm.module.ts";
import { LlmCredentialModule } from "../llm-credential/llm-credential.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { AiController } from "./ai.controller.ts";
import { AiService } from "./ai.service.ts";
import { AiCallRunner } from "./ai-call.ts";
import { AiLedger } from "./ai-ledger.ts";
import { NONCE_SOURCE, randomNonceSource } from "./nonce.ts";

/**
 * Propositions de l'IA. Le registre `LLM_PROVIDERS` vient de `LlmModule` (Anthropic seul) ; le
 * nonce, de `randomNonceSource` (les tests le remplacent par une source déterministe). `AiService`
 * est exporté pour `llmCredential.verify`, dont le contrôleur vit avec les clés BYOK.
 */
@Module({
  imports: [LlmModule, LlmCredentialModule, SpecReadModule, TrackerModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiCallRunner,
    AiLedger,
    { provide: NONCE_SOURCE, useValue: randomNonceSource },
  ],
  exports: [AiService],
})
export class AiModule {}
