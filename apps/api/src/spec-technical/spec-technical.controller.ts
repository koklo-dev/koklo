import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { DATA_PROPOSAL_ROLES, SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecTechnicalService } from "./spec-technical.service.ts";

/**
 * Page Technique (TK-115, B725) : lectures `spec.technical.*` et document par owner, admin, développeur et designer ; client
 * et business 403 (aucun YAML ne sort). « Choisir » : owner, admin et développeur (designer 403). Le rôle est refusé avant
 * le contrôle du projet (404).
 */
@Controller()
export class SpecTechnicalController {
  constructor(
    @Inject(SpecTechnicalService) private readonly service: SpecTechnicalService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.technical.stack.list)
  stackList(@Req() request: Request) {
    return implement(contract.spec.technical.stack.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.stackList(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DATA_PROPOSAL_ROLES)
  @Implement(contract.spec.technical.stack.choose)
  choose(@Req() request: Request) {
    return implement(contract.spec.technical.stack.choose).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.choose(scope, requireSession(request).role ?? "", input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.technical.stack.source)
  source(@Req() request: Request) {
    return implement(contract.spec.technical.stack.source).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.source(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.technical.environments)
  environments(@Req() request: Request) {
    return implement(contract.spec.technical.environments).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.environments(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.document.sections)
  sections(@Req() request: Request) {
    return implement(contract.spec.document.sections).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.sections(scope, input),
        this.access,
      ),
    );
  }
}
