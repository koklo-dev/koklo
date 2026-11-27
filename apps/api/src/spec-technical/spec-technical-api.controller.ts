import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecTechnicalApiService } from "./spec-technical-api.service.ts";

/**
 * Onglets API et Exigences (TK-116) : lectures de l'équipe et du designer ; client et business 403 (ni YAML ni contrat ne
 * sort), avant le contrôle du projet (404).
 */
@Controller()
export class SpecTechnicalApiController {
  constructor(
    @Inject(SpecTechnicalApiService) private readonly service: SpecTechnicalApiService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.technical.ops.list)
  operationList(@Req() request: Request) {
    return implement(contract.spec.technical.ops.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.operationList(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.technical.ops.byId)
  operation(@Req() request: Request) {
    return implement(contract.spec.technical.ops.byId).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.operation(scope, input, input.opId),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.technical.ops.source)
  operationSource(@Req() request: Request) {
    return implement(contract.spec.technical.ops.source).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.operationSource(scope, input, input.opId),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.technical.ops.options)
  options(@Req() request: Request) {
    return implement(contract.spec.technical.ops.options).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.options(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.technical.contract)
  contract(@Req() request: Request) {
    return implement(contract.spec.technical.contract).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.contract(scope, input, input.opId),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.technical.nfr.list)
  nfrList(@Req() request: Request) {
    return implement(contract.spec.technical.nfr.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.nfrList(scope, input),
        this.access,
      ),
    );
  }
}
