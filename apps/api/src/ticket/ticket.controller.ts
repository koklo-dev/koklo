import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { TICKET_WRITE_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_CONTEXT, type ProjectContext } from "../project/project-context.ts";
import { inScope } from "../tracker/scope.ts";
import { TicketService } from "./ticket.service.ts";

/** Lecture ouverte à tout rôle ; écritures : `TICKET_WRITE_ROLES` (CDC §14), rôle relu en base. */
@Controller()
export class TicketController {
  constructor(
    @Inject(TicketService) private readonly service: TicketService,
    @Inject(PROJECT_CONTEXT) private readonly project: ProjectContext,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.ticket.create)
  create(@Req() request: Request) {
    return implement(contract.ticket.create).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) => this.service.create(scope, input)),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.ticket.get)
  get(@Req() request: Request) {
    return implement(contract.ticket.get).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) =>
        this.service.get(scope, input.key, requireSession(request).role),
      ),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.ticket.list)
  list(@Req() request: Request) {
    return implement(contract.ticket.list).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) => {
        const { limit, cursor, sprintId, ...filter } = input;
        return this.service.list(scope, { ...filter, sprintKey: sprintId }, limit, cursor);
      }),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.ticket.update)
  update(@Req() request: Request) {
    return implement(contract.ticket.update).handler(({ input: { key, ...fields }, errors }) =>
      inScope(request, this.project, errors, (scope) => this.service.update(scope, key, fields)),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.ticket.delete)
  delete(@Req() request: Request) {
    return implement(contract.ticket.delete).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) => this.service.delete(scope, input.key)),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.ticket.transition)
  transition(@Req() request: Request) {
    return implement(contract.ticket.transition).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) => this.service.transition(scope, input)),
    );
  }
}
