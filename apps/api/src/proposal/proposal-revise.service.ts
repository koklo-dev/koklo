import type { AgentProposal, AiReviseProposalInput } from "@koklo/contract";
import { PROPOSAL_SCHEMAS } from "@koklo/schema";
import { Inject, Injectable } from "@nestjs/common";
import { AiCallRunner, correlationIdOf, validated } from "../ai/ai-call.ts";
import { revisePrompt } from "../ai/ai-prompts.ts";
import { jsonSchemaOf } from "../ai/ai-schemas.ts";
import { conflict, notFound, orNotFound } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  PROPOSAL_REPOSITORY,
  type ProposalRepository,
  type RevisedContent,
} from "./proposal.repository.ts";
import { assertDeliverableRole } from "./proposal-access.ts";
import { validContent } from "./proposal-content.ts";
import { proposalView } from "./proposal-views.ts";

type Payload = Record<string, unknown>;

/** `specId` de l'original à la place de celui de la sortie ; sans `specId` d'origine, aucun. */
function withOriginalSpecId(revised: Payload, original: Payload | undefined): Payload {
  const { specId: _fromModel, ...payload } = revised;
  const specId = original?.specId;
  return typeof specId === "string" ? { ...payload, specId } : payload;
}

/**
 * « Retoucher » garde le `specId` de l'original (B615), y compris dans l'exigence d'une proposition ASVS (TK-117) : posé
 * par le worker seul, jamais par le modèle.
 */
function keepSpecId(content: RevisedContent, original: Payload): RevisedContent {
  const payload = withOriginalSpecId(content.payload, original);
  const requirement = payload.requirement as Payload | undefined;
  if (requirement === undefined) return { title: content.title, payload };
  const kept = withOriginalSpecId(requirement, original.requirement as Payload | undefined);
  return { title: content.title, payload: { ...payload, requirement: kept } };
}

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
    role: string | undefined,
    input: AiReviseProposalInput,
    requestId: string,
  ): Promise<AgentProposal> {
    const current = orNotFound(await this.proposals.find(scope, input.proposalId));
    assertDeliverableRole(current.deliverable, role);
    if (current.appliedBatchId !== null) throw conflict("proposal_applied");
    if (current.discardReason !== null) throw conflict("proposal_already_present");
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
    const revised = await this.proposals.revise(
      scope,
      current.id,
      keepSpecId(content, current.payload),
    );
    if (revised === null) throw notFound();
    return proposalView(revised);
  }
}
