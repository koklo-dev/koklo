import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { DATA_PROPOSAL_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { ReviewService } from "./review.service.ts";

/**
 * « Valider » la Sécurité (TK-117, B804, B810) : owner, admin et développeur (designer, client et business 403). Rien de
 * propre : c'est `review.submit` du livrable `security`, avec les mêmes refus (`threats_open` puis `data_unclassified`).
 * La route vit ici : valider reste un acte de session humaine du seul module des validations.
 */
@Controller()
export class SecurityValidateController {
  constructor(
    @Inject(ReviewService) private readonly service: ReviewService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DATA_PROPOSAL_ROLES)
  @Implement(contract.security.validate)
  validate(@Req() request: Request) {
    return implement(contract.security.validate).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) =>
          this.service.submit(scope, requireSession(request).role, {
            targetKind: "deliverable",
            targetRef: "security",
            status: "approved",
            version: input.version,
            comment: input.comment,
          }),
        this.access,
      ),
    );
  }
}
