import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { IDEA_READ_ROLES, SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { requestIdOf } from "../request-context.ts";
import { inProject } from "../tracker/scope.ts";
import { IdeaFreezeService } from "./idea-freeze.service.ts";
import { IdeaSynthesisService } from "./idea-synthesis.service.ts";

/**
 * Passage au cadrage et Synthèse de l'idée (TK-91). Même ordre qu'`IdeaController` : garde de rôle (403), projet
 * atteignable (404 uniforme), puis la ressource. Lecture de la Synthèse : six rôles ; figer l'idée et la régénérer :
 * `SPEC_BATCH_ROLES` (ni le client ni le business). Droits vérifiés côté serveur, jamais par l'écran.
 */
@Controller()
export class IdeaFramingController {
  constructor(
    @Inject(IdeaFreezeService) private readonly freezing: IdeaFreezeService,
    @Inject(IdeaSynthesisService) private readonly synthesis: IdeaSynthesisService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.idea.freeze)
  freeze(@Req() request: Request) {
    return implement(contract.idea.freeze).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) =>
          this.freezing.freeze(
            scope,
            requireSession(request).role,
            input.idempotencyKey,
            requestIdOf(request),
          ),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_READ_ROLES)
  @Implement(contract.idea.synthesis.get)
  getSynthesis(@Req() request: Request) {
    return implement(contract.idea.synthesis.get).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.synthesis.get(scope),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.ai.ideaSynthesis)
  regenerate(@Req() request: Request) {
    return implement(contract.ai.ideaSynthesis).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.synthesis.regenerate(scope, requestIdOf(request)),
        this.access,
      ),
    );
  }
}
