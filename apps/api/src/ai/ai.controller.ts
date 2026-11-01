import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, SessionGuard } from "../auth/session.guard.ts";
import { requestIdOf } from "../request-context.ts";
import { inProject } from "../tracker/scope.ts";
import { AiService } from "./ai.service.ts";

/**
 * Propositions de l'IA : `SPEC_BATCH_ROLES` (le client suggère, le business lit ; le designer n'écrit
 * que ses écrans, vérifié à la soumission). L'organisation et l'acteur viennent de la session.
 */
@Controller()
export class AiController {
  constructor(@Inject(AiService) private readonly service: AiService) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.ai.draftBrief)
  draftBrief(@Req() request: Request) {
    return implement(contract.ai.draftBrief).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) =>
        this.service.draftBrief(scope, input, requestIdOf(request)),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.ai.proposeFeatures)
  proposeFeatures(@Req() request: Request) {
    return implement(contract.ai.proposeFeatures).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) =>
        this.service.proposeFeatures(scope, input, requestIdOf(request)),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.ai.proposeCriteria)
  proposeCriteria(@Req() request: Request) {
    return implement(contract.ai.proposeCriteria).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) =>
        this.service.proposeCriteria(scope, input, requestIdOf(request)),
      ),
    );
  }
}
