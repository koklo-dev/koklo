import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { MANAGER_ROLES, REPO_READ_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { RepoService } from "./repo.service.ts";

/** Création et rattachement : `MANAGER_ROLES` ; lecture : `REPO_READ_ROLES` (CDC §14, annexe A §4.0). */
@Controller()
export class RepoController {
  constructor(
    @Inject(RepoService) private readonly service: RepoService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...REPO_READ_ROLES)
  @Implement(contract.repo.list)
  list(@Req() request: Request) {
    return implement(contract.repo.list).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) => this.service.list(scope), this.access),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.repo.link)
  link(@Req() request: Request) {
    return implement(contract.repo.link).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.link(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.repo.createSpec)
  createSpec(@Req() request: Request) {
    return implement(contract.repo.createSpec).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.createSpec(scope, input),
        this.access,
      ),
    );
  }
}
