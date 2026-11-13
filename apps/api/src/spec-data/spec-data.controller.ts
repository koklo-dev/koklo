import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecDataService } from "./spec-data.service.ts";

/**
 * Page Données (TK-107, B389) : owner, admin, développeur et designer en lecture ; client et business 403. Le rôle est refusé
 * avant le contrôle du projet (404).
 */
@Controller()
export class SpecDataController {
  constructor(
    @Inject(SpecDataService) private readonly service: SpecDataService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.data.tables.list)
  tables(@Req() request: Request) {
    return implement(contract.spec.data.tables.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.tables(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.data.mermaid)
  mermaid(@Req() request: Request) {
    return implement(contract.spec.data.mermaid).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.mermaid(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.data.fixtures.list)
  fixtures(@Req() request: Request) {
    return implement(contract.spec.data.fixtures.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.fixtures(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.data.fixtures.rows)
  fixtureRows(@Req() request: Request) {
    return implement(contract.spec.data.fixtures.rows).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.fixtureRows(scope, input),
        this.access,
      ),
    );
  }
}
