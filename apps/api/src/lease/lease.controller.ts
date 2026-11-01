import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { LEASE_ACQUIRE_ROLES, TICKET_WRITE_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { PROJECT_CONTEXT, type ProjectContext } from "../project/project-context.ts";
import { inScope } from "../tracker/scope.ts";
import { LeaseService } from "./lease.service.ts";

/**
 * Prise : `LEASE_ACQUIRE_ROLES`. Heartbeat et release : rôles d'écriture, puis le titulaire seul
 * (`LEASE_NOT_HOLDER`). Lecture : tout rôle, `worktree` masqué hors rôles d'écriture.
 */
@Controller()
export class LeaseController {
  constructor(
    @Inject(LeaseService) private readonly service: LeaseService,
    @Inject(PROJECT_CONTEXT) private readonly project: ProjectContext,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...LEASE_ACQUIRE_ROLES)
  @Implement(contract.lease.acquire)
  acquire(@Req() request: Request) {
    return implement(contract.lease.acquire).handler(({ input, errors }) =>
      inScope(
        request,
        this.project,
        errors,
        (scope) => this.service.acquire(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.lease.heartbeat)
  heartbeat(@Req() request: Request) {
    return implement(contract.lease.heartbeat).handler(({ input, errors }) =>
      inScope(
        request,
        this.project,
        errors,
        (scope) => this.service.heartbeat(scope, input.key),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...TICKET_WRITE_ROLES)
  @Implement(contract.lease.release)
  release(@Req() request: Request) {
    return implement(contract.lease.release).handler(({ input, errors }) =>
      inScope(
        request,
        this.project,
        errors,
        (scope) => this.service.release(scope, input.key),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.lease.get)
  get(@Req() request: Request) {
    return implement(contract.lease.get).handler(({ input, errors }) =>
      inScope(
        request,
        this.project,
        errors,
        (scope) => this.service.get(scope, input.key, requireSession(request).role),
        this.access,
      ),
    );
  }
}
