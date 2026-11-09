import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { ProjectOverviewService } from "./project-overview.service.ts";

/**
 * Vue d'ensemble (TK-92, contrat 2.7.0) : ouverte à tout rôle ayant accès au projet (404 uniforme sinon). Le rôle
 * de la session fixe l'audience et filtre le contenu côté serveur ; il n'est jamais lu de l'entrée.
 */
@Controller()
export class ProjectOverviewController {
  constructor(
    @Inject(ProjectOverviewService) private readonly service: ProjectOverviewService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard)
  @Implement(contract.project.overview)
  overview(@Req() request: Request) {
    return implement(contract.project.overview).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.overview(scope, requireSession(request).role),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.project.activity)
  activity(@Req() request: Request) {
    return implement(contract.project.activity).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.activity(scope, requireSession(request).role, input),
        this.access,
      ),
    );
  }
}
