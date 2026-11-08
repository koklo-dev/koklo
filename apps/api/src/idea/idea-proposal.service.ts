import type { IdeaProposalOutput } from "@koklo/contract";
import { normalizeIdeaContent } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../clock.ts";
import { viaDomain } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  IDEA_PROPOSAL_REPOSITORY,
  type IdeaProposalOutcome,
  type IdeaProposalRepository,
} from "./idea-proposal.repository.ts";
import { pageOf, proposalOf } from "./idea-views.ts";

const outputOf = (outcome: IdeaProposalOutcome): IdeaProposalOutput => ({
  proposal: proposalOf(outcome.proposal),
  page: outcome.page === null ? null : pageOf(outcome.page),
});

/**
 * Décisions humaines sur les propositions de l'agent (TK-90) : seul `decide` change une page. Le texte modifié
 * avant d'accepter (« Modifier ») est un texte humain : les bornes du domaine s'y appliquent, pas le filtre du modèle.
 */
@Injectable()
export class IdeaProposalService {
  constructor(
    @Inject(IDEA_PROPOSAL_REPOSITORY) private readonly repository: IdeaProposalRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async decide(
    scope: ProjectScope,
    input: { proposalId: string; decision: "accept" | "reject"; contentMd?: string | undefined },
  ): Promise<IdeaProposalOutput> {
    const contentMd =
      input.contentMd === undefined
        ? undefined
        : viaDomain(() => normalizeIdeaContent(input.contentMd as string));
    return outputOf(
      await this.repository.decide(
        scope,
        this.actor(),
        input.proposalId,
        input.decision,
        contentMd,
      ),
    );
  }

  async undo(scope: ProjectScope, proposalId: string): Promise<IdeaProposalOutput> {
    return outputOf(await this.repository.undo(scope, this.actor(), proposalId));
  }

  private actor() {
    return { now: new Date(this.clock.now()) };
  }
}
