import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { REVIEW_READ_ROLES, REVIEW_REMIND_ROLES, REVIEW_SUBMIT_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { ReviewService } from "./review.service.ts";

/**
 * Validation (CDC §14, TK-55d, TK-100). Ordre : garde de rôle (403), projet atteignable (404 uniforme, le
 * client n'atteint que ses projets liés), politique par cible (403, D1), puis la tête, la version et la cible. Valider
 * est un acte de session humaine : aucun garde par jeton, agent ou runner n'est monté ici.
 */
@Controller()
export class ReviewController {
  constructor(
    @Inject(ReviewService) private readonly service: ReviewService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...REVIEW_SUBMIT_ROLES)
  @Implement(contract.review.submit)
  submit(@Req() request: Request) {
    return implement(contract.review.submit).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.submit(scope, requireSession(request).role, input),
        this.access,
      ),
    );
  }

  /** Relancer le client (B352) : owner et admin, session humaine ; aucun jeton d'agent n'est accepté. */
  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...REVIEW_REMIND_ROLES)
  @Implement(contract.review.remind)
  remind(@Req() request: Request) {
    return implement(contract.review.remind).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.remind(scope),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...REVIEW_READ_ROLES)
  @Implement(contract.review.list)
  list(@Req() request: Request) {
    return implement(contract.review.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.list(scope, requireSession(request).role, input),
        this.access,
      ),
    );
  }
}
