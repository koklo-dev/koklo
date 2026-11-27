import type { AiPrefillItemInput, AiPrefillItemOutput } from "@koklo/contract";
import { aiPrefillItemOutputSchema } from "@koklo/contract";
import { findSecretPaths } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { assertDeliverableRole } from "../proposal/proposal-access.ts";
import { validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { AiCallRunner, correlationIdOf, validated } from "./ai-call.ts";
import { prefillPrompt } from "./ai-prompts.ts";
import {
  environmentPrefillOutputSchema,
  itemPrefillInputSchema,
  itemPrefillOutputSchema,
  jsonSchemaOf,
  nfrPrefillOutputSchema,
  operationPrefillOutputSchema,
  stackPrefillOutputSchema,
} from "./ai-schemas.ts";

/** Schéma de sortie, schéma demandé au modèle et livrable de chaque feuille préremplie. */
const SHEETS = {
  feature: { schema: itemPrefillOutputSchema, deliverable: "functional" },
  stack: { schema: stackPrefillOutputSchema, deliverable: "technical" },
  environment: { schema: environmentPrefillOutputSchema, deliverable: "technical" },
  operation: { schema: operationPrefillOutputSchema, deliverable: "technical" },
  nfr: { schema: nfrPrefillOutputSchema, deliverable: "technical" },
} as const;

/** Un champ qui porte une valeur de secret est retiré (TK-115, B724) ; les autres restent. */
function withoutSecrets(values: Record<string, unknown>): Record<string, unknown> {
  const refused = new Set(findSecretPaths(values).map((pointer) => pointer.split("/")[1]));
  if (refused.has(undefined)) return {};
  return Object.fromEntries(Object.entries(values).filter(([key]) => !refused.has(key)));
}

/**
 * Préremplissage du panneau d'édition (TK-101, B329 d ; cahier technique, TK-115 et TK-116). Un appel synchrone par
 * le moteur partagé (refus, quota et audit comme les autres `ai.*`) ; la phrase entre comme donnée non fiable, la sortie
 * est du texte brut validé, sans valeur de secret. RIEN n'est écrit : ni lot, ni proposition, ni lancement. Le formulaire
 * garde la main sur ce qu'il accepte.
 */
@Injectable()
export class AiPrefillService {
  constructor(@Inject(AiCallRunner) private readonly runner: AiCallRunner) {}

  async prefill(
    scope: ProjectScope,
    role: string | undefined,
    input: AiPrefillItemInput,
    requestId: string,
  ): Promise<AiPrefillItemOutput> {
    const { schema, deliverable } = SHEETS[input.type];
    assertDeliverableRole(deliverable, role);
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
      output: { kind: "json", schema: jsonSchemaOf(schema) },
      frame: (nonce) => prefillPrompt(nonce, input.description, input.type),
      settle: (response) => validated(response, (raw) => schema.parse(raw)),
    });
    return aiPrefillItemOutputSchema.parse({ type: input.type, values: withoutSecrets(values) });
  }
}
