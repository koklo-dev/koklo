import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { COMMENT_WRITE_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_CONTEXT, type ProjectContext } from "../project/project-context.ts";
import { inScope } from "../tracker/scope.ts";
import { CommentService } from "./comment.service.ts";

/** Écriture : `COMMENT_WRITE_ROLES` (le business lit). Lecture : tout rôle. Suppression : droit d'auteur dans le service. */
@Controller()
export class CommentController {
  constructor(
    @Inject(CommentService) private readonly service: CommentService,
    @Inject(PROJECT_CONTEXT) private readonly project: ProjectContext,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...COMMENT_WRITE_ROLES)
  @Implement(contract.comment.create)
  create(@Req() request: Request) {
    return implement(contract.comment.create).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) =>
        this.service.create(scope, requireSession(request).role, input),
      ),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.comment.list)
  list(@Req() request: Request) {
    return implement(contract.comment.list).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) => this.service.list(scope, input)),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...COMMENT_WRITE_ROLES)
  @Implement(contract.comment.delete)
  delete(@Req() request: Request) {
    return implement(contract.comment.delete).handler(({ input, errors }) =>
      inScope(request, this.project, errors, (scope) =>
        this.service.delete(scope, requireSession(request).role, input.id),
      ),
    );
  }
}
