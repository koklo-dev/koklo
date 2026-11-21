import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecArchitectureService } from "./spec-architecture.service.ts";

/**
 * Page Architecture (TK-111, B510) : owner, admin, développeur et designer en lecture ; client et business 403 (aucun YAML ni
 * Mermaid ne sort). Le rôle est refusé avant le contrôle du projet (404). L'écriture passe par `specBatch.submit` et
 * `ai.proposeDeliverable` (owner, admin, développeur ; le designer reçoit FORBIDDEN du worker, comme pour les Données).
 */
@Controller()
export class SpecArchitectureController {
  constructor(
    @Inject(SpecArchitectureService) private readonly service: SpecArchitectureService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.components.list)
  components(@Req() request: Request) {
    return implement(contract.spec.architecture.components.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.components(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.document)
  document(@Req() request: Request) {
    return implement(contract.spec.architecture.document).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.document(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.checks)
  checks(@Req() request: Request) {
    return implement(contract.spec.architecture.checks).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.checks(scope),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.adr.list)
  adrs(@Req() request: Request) {
    return implement(contract.spec.architecture.adr.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.adrs(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.adr.byId)
  adr(@Req() request: Request) {
    return implement(contract.spec.architecture.adr.byId).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.adr(scope, input),
        this.access,
      ),
    );
  }
}
