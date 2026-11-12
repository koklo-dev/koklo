import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecItemService } from "./spec-item.service.ts";

/** Panneau d'édition (TK-101) : `SPEC_BATCH_ROLES` seuls ; le rôle est refusé avant le contrôle de projet (404). */
@Controller()
export class SpecItemController {
  constructor(
    @Inject(SpecItemService) private readonly service: SpecItemService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.item.get)
  get(@Req() request: Request) {
    return implement(contract.spec.item.get).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.get(scope, requireSession(request).role, input.type, input.id),
        this.access,
      ),
    );
  }
}
