import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecSecurityService } from "./spec-security.service.ts";

/**
 * Lectures `security.*` (TK-117, B810) : owner, admin, développeur et designer ; client et business 403 avant le contrôle
 * du projet (404). Les écritures sont dans `SpecSecurityWritesController`.
 */
@Controller()
export class SpecSecurityController {
  constructor(
    @Inject(SpecSecurityService) private readonly service: SpecSecurityService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.security.threat.list)
  threats(@Req() request: Request) {
    return implement(contract.security.threat.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.threats(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.security.threat.byId)
  threat(@Req() request: Request) {
    return implement(contract.security.threat.byId).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.threat(scope, input, input.threatId),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.security.data.list)
  data(@Req() request: Request) {
    return implement(contract.security.data.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.data(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.security.registry.export)
  registry(@Req() request: Request) {
    return implement(contract.security.registry.export).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.registry(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.security.rights.get)
  rights(@Req() request: Request) {
    return implement(contract.security.rights.get).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.rights(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.security.asvs.report)
  asvs(@Req() request: Request) {
    return implement(contract.security.asvs.report).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.asvs(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.security.summary.get)
  summary(@Req() request: Request) {
    return implement(contract.security.summary.get).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.summary(scope, input),
        this.access,
      ),
    );
  }
}
