import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { TICKET_WRITE_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { TicketService } from "./ticket.service.ts";

/** Dépendances entre tickets : mêmes rôles que les tickets (lecture ouverte, écriture `TICKET_WRITE_ROLES`). */
@Controller()
export class DependencyController {
  constructor(
    @Inject(TicketService) private readonly service: TicketService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.dependency.add)
  add(@Req() request: Request) {
    return implement(contract.dependency.add).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.addDependency(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.dependency.remove)
  remove(@Req() request: Request) {
    return implement(contract.dependency.remove).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.removeDependency(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.dependency.list)
  list(@Req() request: Request) {
    return implement(contract.dependency.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.listDependencies(scope, input.key),
        this.access,
      ),
    );
  }
}
