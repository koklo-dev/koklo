import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { ORGANIZATION_CONTEXT, type OrganizationContext } from "./organization-context.ts";
import { ProjectService } from "./project.service.ts";

@Controller()
export class ProjectController {
  constructor(
    @Inject(ProjectService) private readonly service: ProjectService,
    @Inject(ORGANIZATION_CONTEXT) private readonly organization: OrganizationContext,
  ) {}

  @UseGuards(SessionGuard)
  @Implement(contract.project.list)
  list(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.project.list).handler(({ errors }) =>
      guard(requestId, errors, async () =>
        this.service.list(await this.organization.organizationId(request)),
      ),
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
        this.service.create(await this.organization.organizationId(request), input.name),
      ),
    );
  }
}
