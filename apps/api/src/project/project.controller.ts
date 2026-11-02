import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { ProjectService } from "./project.service.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "./project-access.ts";

@Controller()
export class ProjectController {
  constructor(
    @Inject(ProjectService) private readonly service: ProjectService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard)
  @Implement(contract.project.list)
  list(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.project.list).handler(({ errors }) =>
      guard(requestId, errors, async () => {
        const session = requireSession(request);
        const linked = await this.access.linkedProjectIds(session);
        return this.service.listVisible(session.organizationId, linked);
      }),
    );
  }

  /** Option prudente (H1) : owner et admin seulement, rôle relu en base. */
  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.project.create)
  create(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.project.create).handler(({ input, errors }) =>
      guard(requestId, errors, async () =>
        this.service.create(requireSession(request), input.name),
      ),
    );
  }
}
