import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { PROPOSAL_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { requestIdOf } from "../request-context.ts";
import { inProject } from "../tracker/scope.ts";
import { ProposalService } from "./proposal.service.ts";
import { ProposalLaunchService } from "./proposal-launch.service.ts";
import { ProposalReviseService } from "./proposal-revise.service.ts";

/**
 * Propositions de l'agent : `PROPOSAL_ROLES` partout (client et business : 403). L'organisation et l'acteur
 * viennent de la session, le projet de l'entrée (accès contrôlé avant tout travail).
 */
@Controller()
export class ProposalController {
  constructor(
    @Inject(ProposalService) private readonly proposals: ProposalService,
    @Inject(ProposalLaunchService) private readonly launches: ProposalLaunchService,
    @Inject(ProposalReviseService) private readonly revisions: ProposalReviseService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROPOSAL_ROLES)
  @Implement(contract.ai.proposeDeliverable)
  proposeDeliverable(@Req() request: Request) {
    return implement(contract.ai.proposeDeliverable).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.launches.propose(scope, input, requestIdOf(request)),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROPOSAL_ROLES)
  @Implement(contract.ai.proposeOptions)
  proposeOptions(@Req() request: Request) {
    return implement(contract.ai.proposeOptions).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.launches.options(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROPOSAL_ROLES)
  @Implement(contract.ai.reviseProposal)
  reviseProposal(@Req() request: Request) {
    return implement(contract.ai.reviseProposal).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.revisions.revise(scope, input, requestIdOf(request)),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROPOSAL_ROLES)
  @Implement(contract.proposal.list)
  list(@Req() request: Request) {
    return implement(contract.proposal.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.proposals.list(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROPOSAL_ROLES)
  @Implement(contract.proposal.decide)
  decide(@Req() request: Request) {
    return implement(contract.proposal.decide).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.proposals.decide(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROPOSAL_ROLES)
  @Implement(contract.proposal.decideMany)
  decideMany(@Req() request: Request) {
    return implement(contract.proposal.decideMany).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.proposals.decideMany(scope, input),
        this.access,
      ),
    );
  }
}
