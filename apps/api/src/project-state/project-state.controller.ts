import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { PROJECT_STATE_READ_ROLES, PROJECT_STATE_WRITE_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_CONTEXT, type ProjectContext } from "../project/project-context.ts";
import { inScope } from "../tracker/scope.ts";
import { ProjectStateService } from "./project-state.service.ts";

/** Le contenu porte politique de merge et réglages : lecture et écriture sont restreintes par rôle. */
@Controller()
export class ProjectStateController {
  constructor(
    @Inject(ProjectStateService) private readonly service: ProjectStateService,
    @Inject(PROJECT_CONTEXT) private readonly project: ProjectContext,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROJECT_STATE_READ_ROLES)
  @Implement(contract.projectState.get)
  get(@Req() request: Request) {
    return implement(contract.projectState.get).handler(({ errors }) =>
      inScope(request, this.project, errors, (scope) => this.service.get(scope)),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROJECT_STATE_WRITE_ROLES)
  @Implement(contract.projectState.update)
  update(@Req() request: Request) {
    return implement(contract.projectState.update).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) => this.service.update(scope, input)),
    );
  }
}
