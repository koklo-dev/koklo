import type {
  AiDraftBriefInput,
  AiProposeCriteriaInput,
  AiProposeFeaturesInput,
} from "@koklo/contract";
import type { LlmProviderId } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import { SpecReadService } from "../spec-read/spec-read.service.ts";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { AiPurpose } from "./ai-budget.ts";
import { AiCallRunner, correlationIdOf, validated } from "./ai-call.ts";
import { briefPrompt, criteriaPrompt, featuresPrompt, verifyPrompt } from "./ai-prompts.ts";
import { duplicatesOf, metaOf } from "./ai-results.ts";
import {
  briefOutputSchema,
  criteriaOutputSchema,
  DEFAULT_MAX_FEATURES,
  featuresOutputSchema,
  jsonSchemaOf,
} from "./ai-schemas.ts";

const BRIEF_SCHEMA = jsonSchemaOf(briefOutputSchema);
const CRITERIA_SCHEMA = jsonSchemaOf(criteriaOutputSchema);
const FEATURES_SCHEMA = jsonSchemaOf(featuresOutputSchema(DEFAULT_MAX_FEATURES));

/** Le seul fournisseur des propositions en 0.9.0 ; `verify` reçoit le sien en paramètre. */
const PROPOSAL_PROVIDER = "anthropic" as const;

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

  async draftBrief(scope: ProjectScope, input: AiDraftBriefInput, requestId: string) {
    await this.transactions.run(scope, async () => undefined);
    return this.runner.run({
      ...this.base(scope, requestId, "brief-draft", "ai.brief.draft"),
      output: { kind: "json", schema: BRIEF_SCHEMA },
      frame: (nonce) => briefPrompt(nonce, input),
      settle: (response) => ({
        brief: validated(response, (raw) => briefOutputSchema.parse(raw)),
        meta: metaOf(PROPOSAL_PROVIDER, response),
      }),
    });
  }

  async proposeFeatures(scope: ProjectScope, input: AiProposeFeaturesInput, requestId: string) {
    const existing = await this.specs.indexedFeatures(scope);
    const maxFeatures = input.maxFeatures ?? DEFAULT_MAX_FEATURES;
    return this.runner.run({
      ...this.base(scope, requestId, "features-propose", "ai.features.propose"),
      output: { kind: "json", schema: FEATURES_SCHEMA },
      frame: (nonce) => featuresPrompt(nonce, { brief: input.brief, maxFeatures, existing }),
      settle: (response) => {
        const { features } = validated(response, (raw) =>
          featuresOutputSchema(maxFeatures).parse(raw),
        );
        return {
          features: features.map((feature) => ({ kind: "feature.create" as const, ...feature })),
          duplicates: duplicatesOf(features, existing),
          meta: metaOf(PROPOSAL_PROVIDER, response),
        };
      },
    });
  }

  async proposeCriteria(scope: ProjectScope, input: AiProposeCriteriaInput, requestId: string) {
    const feature = await this.specs.getFeature(scope, input.specId);
    return this.runner.run({
      ...this.base(scope, requestId, "criteria-propose", "ai.criteria.propose"),
      output: { kind: "json", schema: CRITERIA_SCHEMA },
      frame: (nonce) => criteriaPrompt(nonce, feature),
      settle: (response) => ({
        operation: {
          kind: "feature.update" as const,
          specId: feature.specId,
          ...validated(response, (raw) => criteriaOutputSchema.parse(raw)),
        },
        meta: metaOf(PROPOSAL_PROVIDER, response),
      }),
    });
  }

  /** Appel minimal (16 tokens, prompt constant) : rien n'est conservé de la réponse. */
  verify(
    actor: { organizationId: string; userId: string },
    provider: LlmProviderId,
    requestId: string,
  ) {
    return this.runner.run({
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
      provider: PROPOSAL_PROVIDER,
      actor: { organizationId: scope.organizationId, userId: scope.userId },
      correlationId: correlationIdOf(requestId),
      quota: "ai" as const,
      entry: () => ({ action, targetKind: "project" as const, targetId: scope.projectId }),
    };
  }
}
