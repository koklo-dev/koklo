import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { AUDIT_READ_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_CONTEXT, type ProjectContext } from "../project/project-context.ts";
import { inScope } from "../tracker/scope.ts";
import { AuditService } from "./audit.service.ts";

/** Le journal n'a qu'une lecture, réservée à `AUDIT_READ_ROLES` (immuable, CDC §4.2). */
@Controller()
export class AuditController {
  constructor(
    @Inject(AuditService) private readonly service: AuditService,
    @Inject(PROJECT_CONTEXT) private readonly project: ProjectContext,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...AUDIT_READ_ROLES)
  @Implement(contract.audit.list)
  list(@Req() request: Request) {
    return implement(contract.audit.list).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) => this.service.list(scope, input)),
    );
  }
}
