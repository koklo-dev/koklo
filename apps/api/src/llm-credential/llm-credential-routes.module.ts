import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.ts";
import { LlmCredentialController } from "./llm-credential.controller.ts";
import { LlmCredentialModule } from "./llm-credential.module.ts";

/** Routes des clés BYOK : à part du magasin, car `verify` passe par `AiService` (qui dépend du magasin). */
@Module({
  imports: [LlmCredentialModule, AiModule],
  controllers: [LlmCredentialController],
})
export class LlmCredentialRoutesModule {}
