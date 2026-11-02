import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { PROJECT_CLIENT_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { ProjectClientService } from "./project-client.service.ts";

/**
 * Lier un membre `client` à un projet : owner et admin (CDC §14, TK-55a). Ordre : garde de rôle
 * (403), projet de l'organisation (404 uniforme), puis membre (422 uniforme).
 */
@Controller()
export class ProjectClientController {
  constructor(
    @Inject(ProjectClientService) private readonly service: ProjectClientService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROJECT_CLIENT_ROLES)
  @Implement(contract.projectClient.list)
  list(@Req() request: Request) {
    return implement(contract.projectClient.list).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) => this.service.list(scope), this.access),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROJECT_CLIENT_ROLES)
  @Implement(contract.projectClient.add)
  add(@Req() request: Request) {
    return implement(contract.projectClient.add).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.add(scope, input.memberId),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...PROJECT_CLIENT_ROLES)
  @Implement(contract.projectClient.remove)
  remove(@Req() request: Request) {
    return implement(contract.projectClient.remove).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.remove(scope, input.memberId),
        this.access,
      ),
    );
  }
}
