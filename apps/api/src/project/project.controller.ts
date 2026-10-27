import { contract } from "@koklo/contract";
import { Controller, Inject, Req } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { guard, requestIdFrom } from "../request-context.ts";
import { ORGANIZATION_CONTEXT, type OrganizationContext } from "./organization-context.ts";
import { ProjectService } from "./project.service.ts";

@Controller()
export class ProjectController {
  constructor(
    @Inject(ProjectService) private readonly service: ProjectService,
    @Inject(ORGANIZATION_CONTEXT) private readonly organization: OrganizationContext,
  ) {}

  @Implement(contract.project.list)
  list(@Req() request: Request) {
    const requestId = requestIdFrom(request.headers["x-request-id"]);
    return implement(contract.project.list).handler(({ errors }) =>
      guard(requestId, errors, async () =>
        this.service.list(await this.organization.organizationId()),
      ),
    );
  }
}
