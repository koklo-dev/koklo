import { AnthropicProvider } from "@koklo/llm";
import { Module } from "@nestjs/common";
import { LLM_PROVIDERS, type LlmProviderRegistry } from "./tokens.ts";

/**
 * Registre de production : l'adaptateur Anthropic seul, choisi ici par le code et jamais par la
 * configuration (aucun réglage ne désigne un fournisseur). `fetch` global est lu à chaque appel, il
 * n'y a aucune option d'URL. Le faux du port n'est placé sous `LLM_PROVIDERS` que par les tests.
 */
@Module({
  providers: [
    {
      provide: LLM_PROVIDERS,
      useFactory: (): LlmProviderRegistry => new Map([["anthropic", new AnthropicProvider()]]),
    },
  ],
  exports: [LLM_PROVIDERS],
})
export class LlmModule {}
