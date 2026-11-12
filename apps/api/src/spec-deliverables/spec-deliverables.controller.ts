import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { DELIVERABLE_FORCE_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecDeliverablesService } from "./spec-deliverables.service.ts";

/**
 * Livrables de la spec (TK-100, contrat 2.10.0). La lecture est ouverte à tout rôle ayant accès au projet (404 uniforme
 * sinon) ; le forçage est réservé à owner et admin : le rôle est refusé avant tout contrôle de projet (403). Aucun jeton
 * d'agent ni de runner : `SessionGuard` seul identifie l'appelant.
 */
@Controller()
export class SpecDeliverablesController {
  constructor(
    @Inject(SpecDeliverablesService) private readonly service: SpecDeliverablesService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard)
  @Implement(contract.spec.deliverables)
  deliverables(@Req() request: Request) {
    return implement(contract.spec.deliverables).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.list(scope, requireSession(request).role),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DELIVERABLE_FORCE_ROLES)
  @Implement(contract.spec.forceDeliverable)
  forceDeliverable(@Req() request: Request) {
    return implement(contract.spec.forceDeliverable).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.force(scope, requireSession(request).role, input.key),
        this.access,
      ),
    );
  }
}
