import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SPEC_MIGRATION_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecMigrationService } from "./spec-migration.service.ts";

/**
 * Migration du format de spec (TK-106) : `SPEC_MIGRATION_ROLES` (owner seul). Garde de rôle (403), puis projet
 * atteignable (404 uniforme), puis le lot. Droits vérifiés côté serveur, jamais par l'écran.
 */
@Controller()
export class SpecMigrationController {
  constructor(
    @Inject(SpecMigrationService) private readonly service: SpecMigrationService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_MIGRATION_ROLES)
  @Implement(contract.specMigration.start)
  start(@Req() request: Request) {
    return implement(contract.specMigration.start).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.start(scope, requireSession(request).role ?? "", input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_MIGRATION_ROLES)
  @Implement(contract.specMigration.revert)
  revert(@Req() request: Request) {
    return implement(contract.specMigration.revert).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.revert(scope, requireSession(request).role ?? "", input),
        this.access,
      ),
    );
  }
}
