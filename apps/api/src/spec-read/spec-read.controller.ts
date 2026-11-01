import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SPEC_READ_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecReadService } from "./spec-read.service.ts";

/**
 * Lectures de la spec brute (CDC §8.2) : cinq rôles d'équipe, fermées au client (403, TK-55a D7). Le
 * rôle est refusé avant tout contrôle de projet ; l'accès au projet est ensuite contrôlé (404).
 */
@Controller()
export class SpecReadController {
  constructor(
    @Inject(SpecReadService) private readonly service: SpecReadService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_READ_ROLES)
  @Implement(contract.spec.head)
  head(@Req() request: Request) {
    return implement(contract.spec.head).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.head(scope, { branch: input.branch, commitSha: input.commitSha }),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_READ_ROLES)
  @Implement(contract.spec.listFeatures)
  listFeatures(@Req() request: Request) {
    return implement(contract.spec.listFeatures).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.listFeatures(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_READ_ROLES)
  @Implement(contract.spec.getFeature)
  getFeature(@Req() request: Request) {
    return implement(contract.spec.getFeature).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.getFeature(scope, input.specId),
        this.access,
      ),
    );
  }
}
