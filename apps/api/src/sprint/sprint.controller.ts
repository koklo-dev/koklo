import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { TICKET_WRITE_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SprintService } from "./sprint.service.ts";

/** Lecture ouverte à tout rôle ; écritures : `TICKET_WRITE_ROLES` (CDC §14), rôle relu en base. */
@Controller()
export class SprintController {
  constructor(
    @Inject(SprintService) private readonly service: SprintService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.sprint.create)
  create(@Req() request: Request) {
    return implement(contract.sprint.create).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.create(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.sprint.get)
  get(@Req() request: Request) {
    return implement(contract.sprint.get).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.get(scope, input.key),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.sprint.list)
  list(@Req() request: Request) {
    return implement(contract.sprint.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.list(scope, input.status),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.sprint.update)
  update(@Req() request: Request) {
    return implement(contract.sprint.update).handler(
      ({ input: { projectId, key, ...fields }, errors }) =>
        inProject(
          request,
          errors,
          projectId,
          (scope) => this.service.update(scope, key, fields),
          this.access,
        ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.sprint.activate)
  activate(@Req() request: Request) {
    return implement(contract.sprint.activate).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.activate(scope, input.key),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.sprint.close)
  close(@Req() request: Request) {
    return implement(contract.sprint.close).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.close(scope, input.key),
        this.access,
      ),
    );
  }
}
