import type { AiProposeCriteriaInput, AiProposeFeaturesInput } from "@koklo/contract";
import { readFrozenDossier } from "@koklo/db";
import type { LlmProviderId } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import { SpecReadService } from "../spec-read/spec-read.service.ts";
import { validation } from "../tracker/api-errors.ts";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { AiPurpose } from "./ai-budget.ts";
import { AiCallRunner, correlationIdOf, validated } from "./ai-call.ts";
import { criteriaPrompt, featuresPrompt, verifyPrompt } from "./ai-prompts.ts";
import { duplicatesOf, metaOf } from "./ai-results.ts";
import {
  criteriaOutputSchema,
  DEFAULT_MAX_FEATURES,
  featuresOutputSchema,
  jsonSchemaOf,
} from "./ai-schemas.ts";

const CRITERIA_SCHEMA = jsonSchemaOf(criteriaOutputSchema);
const FEATURES_SCHEMA = jsonSchemaOf(featuresOutputSchema(DEFAULT_MAX_FEATURES));

/**
 * Propositions de l'IA et vérification de clé. Une proposition n'est JAMAIS persistée : ni brief,
 * ni feature, ni lot (CDC §6.3) ; l'humain relit puis soumet à `specBatch.submit`.
 */
@Injectable()
export class AiService {
  constructor(
    @Inject(AiCallRunner) private readonly runner: AiCallRunner,
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecReadService) private readonly specs: SpecReadService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async proposeFeatures(scope: ProjectScope, input: AiProposeFeaturesInput, requestId: string) {
    const sources = await this.transactions.run(scope, (tx) =>
      readFrozenDossier(tx, scope.projectId),
    );
    if (sources === null) {
      throw validation("projectId", "Le dossier d'idée n'a pas de version figée à lire");
    }
    const existing = await this.specs.indexedFeatures(scope);
    const maxFeatures = input.maxFeatures ?? DEFAULT_MAX_FEATURES;
    return this.runner.run({
      ...this.base(scope, requestId, "features-propose", "ai.features.propose"),
      usage: "spec_deliverables" as const,
      output: { kind: "json", schema: FEATURES_SCHEMA },
      frame: (nonce) => featuresPrompt(nonce, { sources, maxFeatures }),
      settle: (response) => {
        const { features } = validated(response, (raw) =>
          featuresOutputSchema(maxFeatures).parse(raw),
        );
        return {
          features: features.map((feature) => ({ kind: "feature.create" as const, ...feature })),
          duplicates: duplicatesOf(features, existing),
          meta: metaOf(response),
        };
      },
    });
  }

  async proposeCriteria(scope: ProjectScope, input: AiProposeCriteriaInput, requestId: string) {
    const feature = await this.specs.getFeature(scope, input.specId);
    return this.runner.run({
      ...this.base(scope, requestId, "criteria-propose", "ai.criteria.propose"),
      usage: "spec_deliverables" as const,
      output: { kind: "json", schema: CRITERIA_SCHEMA },
      frame: (nonce) => criteriaPrompt(nonce, feature),
      settle: (response) => ({
        operation: {
          kind: "feature.update" as const,
          specId: feature.specId,
          ...validated(response, (raw) => criteriaOutputSchema.parse(raw)),
        },
        meta: metaOf(response),
      }),
    });
  }

  /**
   * Appel minimal (16 tokens, prompt constant) : rien n'est conservé de la réponse. Sans usage : le
   * fournisseur est celui de l'URL, le modèle celui de sa clé ou du catalogue (B46) ; ni plafond ni comptage.
   */
  verify(
    actor: { organizationId: string; userId: string },
    provider: LlmProviderId,
    requestId: string,
  ) {
    return this.runner.verify({
      purpose: "credential-verify",
      provider,
      actor,
      correlationId: correlationIdOf(requestId),
      quota: "verify",
      output: { kind: "text" },
      entry: (credentialId) => ({
        action: "llm_credential.verify",
        targetKind: "llm_credential",
        targetId: credentialId,
      }),
      frame: verifyPrompt,
      settle: (response) => ({
        ok: true as const,
        model: response.model,
        checkedAt: this.clock.now(),
      }),
    });
  }

  private base(scope: ProjectScope, requestId: string, purpose: AiPurpose, action: string) {
    return {
      purpose,
      actor: { organizationId: scope.organizationId, userId: scope.userId },
      projectId: scope.projectId,
      correlationId: correlationIdOf(requestId),
      quota: "ai" as const,
      entry: () => ({ action, targetKind: "project" as const, targetId: scope.projectId }),
    };
  }
}
