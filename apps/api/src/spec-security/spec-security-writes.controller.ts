import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { DATA_PROPOSAL_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { ProposalLaunchService } from "../proposal/proposal-launch.service.ts";
import { requestIdOf } from "../request-context.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecSecurityWritesService } from "./spec-security-writes.service.ts";

const roleOf = (request: Request) => requireSession(request).role ?? "";

/**
 * Écritures `security.*` (B807, B810) : owner, admin et développeur (designer 403). Un lot d'une opération ; « Mettre à
 * jour avec l'agent » emprunte le circuit commun des propositions (B806).
 */
@Controller()
export class SpecSecurityWritesController {
  constructor(
    @Inject(SpecSecurityWritesService) private readonly writes: SpecSecurityWritesService,
    @Inject(ProposalLaunchService) private readonly launches: ProposalLaunchService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DATA_PROPOSAL_ROLES)
  @Implement(contract.security.threat.create)
  createThreat(@Req() request: Request) {
    return implement(contract.security.threat.create).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.writes.createThreat(scope, roleOf(request), input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DATA_PROPOSAL_ROLES)
  @Implement(contract.security.threat.update)
  updateThreat(@Req() request: Request) {
    return implement(contract.security.threat.update).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.writes.updateThreat(scope, roleOf(request), input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DATA_PROPOSAL_ROLES)
  @Implement(contract.security.data.classify)
  classify(@Req() request: Request) {
    return implement(contract.security.data.classify).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.writes.classify(scope, roleOf(request), input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DATA_PROPOSAL_ROLES)
  @Implement(contract.security.asvs.setLevel)
  setLevel(@Req() request: Request) {
    return implement(contract.security.asvs.setLevel).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.writes.setLevel(scope, roleOf(request), input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DATA_PROPOSAL_ROLES)
  @Implement(contract.security.summary.accept)
  acceptSummary(@Req() request: Request) {
    return implement(contract.security.summary.accept).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.writes.acceptSummary(scope, roleOf(request), input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DATA_PROPOSAL_ROLES)
  @Implement(contract.security.summary.propose)
  proposeSummary(@Req() request: Request) {
    return implement(contract.security.summary.propose).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) =>
          this.launches.propose(
            scope,
            { ...input, deliverable: "security", mode: "summary" },
            requestIdOf(request),
            roleOf(request),
          ),
        this.access,
      ),
    );
  }
}
