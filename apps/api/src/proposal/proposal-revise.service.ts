import type { AgentProposal, AiReviseProposalInput } from "@koklo/contract";
import { PROPOSAL_SCHEMAS } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { AiCallRunner, correlationIdOf, validated } from "../ai/ai-call.ts";
import { revisePrompt } from "../ai/ai-prompts.ts";
import { jsonSchemaOf } from "../ai/ai-schemas.ts";
import { conflict, notFound, orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import { PROPOSAL_REPOSITORY, type ProposalRepository } from "./proposal.repository.ts";
import { validContent } from "./proposal-content.ts";
import { proposalView } from "./proposal-views.ts";

/**
 * Révision d'UNE proposition : appel synchrone par le moteur partagé (refus, quota et audit comme les autres `ai.*`),
 * sortie validée par le schéma du type (texte brut). La proposition reste `pending` ; rien n'entre dans la spec.
 */
@Injectable()
export class ProposalReviseService {
  constructor(
    @Inject(PROPOSAL_REPOSITORY) private readonly proposals: ProposalRepository,
    @Inject(AiCallRunner) private readonly runner: AiCallRunner,
  ) {}

  async revise(
    scope: ProjectScope,
    input: AiReviseProposalInput,
    requestId: string,
  ): Promise<AgentProposal> {
    const current = orNotFound(await this.proposals.find(scope, input.proposalId));
    if (current.appliedBatchId !== null) throw conflict("proposal_applied");
    const schema = PROPOSAL_SCHEMAS[current.kind];
    const content = await this.runner.run({
      purpose: "proposal-revise",
      usage: "spec_deliverables",
      actor: { organizationId: scope.organizationId, userId: scope.userId },
      projectId: scope.projectId,
      correlationId: correlationIdOf(requestId),
      quota: "ai",
      entry: () => ({
        action: "ai.proposal.revise",
        targetKind: "agent_proposal",
        targetId: current.id,
      }),
      output: { kind: "json", schema: jsonSchemaOf(schema) },
      frame: (nonce) =>
        revisePrompt(nonce, { content: current.payload, instruction: input.instruction }),
      settle: (response) =>
        validContent(
          current.kind,
          validated(response, (raw) => schema.parse(raw)),
          "content",
          current.title,
        ),
    });
    const revised = await this.proposals.revise(scope, current.id, content);
    if (revised === null) throw notFound();
    return proposalView(revised);
  }
}
