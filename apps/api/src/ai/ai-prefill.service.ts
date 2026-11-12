import type { AiPrefillItemInput, AiPrefillItemOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { AiCallRunner, correlationIdOf, validated } from "./ai-call.ts";
import { prefillPrompt } from "./ai-prompts.ts";
import { itemPrefillInputSchema, itemPrefillOutputSchema, jsonSchemaOf } from "./ai-schemas.ts";

const PREFILL_SCHEMA = jsonSchemaOf(itemPrefillOutputSchema);

/**
 * Préremplissage du panneau d'édition (TK-101, B329 d). Un appel synchrone par le moteur partagé (refus, quota et audit
 * comme les autres `ai.*`) ; la phrase entre comme donnée non fiable, la sortie est du texte brut validé. RIEN n'est écrit :
 * ni lot, ni proposition, ni lancement. Le formulaire garde la main sur ce qu'il accepte.
 */
@Injectable()
export class AiPrefillService {
  constructor(@Inject(AiCallRunner) private readonly runner: AiCallRunner) {}

  async prefill(
    scope: ProjectScope,
    input: AiPrefillItemInput,
    requestId: string,
  ): Promise<AiPrefillItemOutput> {
    // Politique de texte brut appliquée aussi à l'entrée, avant toute dépense (quota, appel).
    if (!itemPrefillInputSchema.safeParse(input.description).success) {
      throw validation("description", "texte brut attendu : ni lien, ni balise");
    }
    const values = await this.runner.run({
      purpose: "item-prefill",
      usage: "spec_deliverables",
      actor: { organizationId: scope.organizationId, userId: scope.userId },
      projectId: scope.projectId,
      correlationId: correlationIdOf(requestId),
      quota: "ai",
      entry: () => ({
        action: "ai.item.prefill",
        targetKind: "project",
        targetId: scope.projectId,
      }),
      output: { kind: "json", schema: PREFILL_SCHEMA },
      frame: (nonce) => prefillPrompt(nonce, input.description),
      settle: (response) => validated(response, (raw) => itemPrefillOutputSchema.parse(raw)),
    });
    return { type: input.type, values };
  }
}
