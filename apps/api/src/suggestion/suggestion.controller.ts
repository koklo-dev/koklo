import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import {
  SUGGESTION_CREATE_ROLES,
  SUGGESTION_DECIDE_ROLES,
  SUGGESTION_READ_ROLES,
} from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SuggestionService } from "./suggestion.service.ts";

const viewerOf = (request: Request) => ({ role: requireSession(request).role });

/**
 * Suggestions `SG-n` (CDC §14, TK-55c). Ordre : garde de rôle (403), projet atteignable (404
 * uniforme, le client n'atteint que ses projets liés), puis la suggestion (404 / 409). Accepter et
 * rejeter sont des décisions de session humaine : aucun garde par jeton n'est monté ici.
 */
@Controller()
export class SuggestionController {
  constructor(
    @Inject(SuggestionService) private readonly service: SuggestionService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_CREATE_ROLES)
  @Implement(contract.suggestion.create)
  create(@Req() request: Request) {
    return implement(contract.suggestion.create).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.create(scope, viewerOf(request), input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_READ_ROLES)
  @Implement(contract.suggestion.list)
  list(@Req() request: Request) {
    return implement(contract.suggestion.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.list(scope, viewerOf(request), input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_CREATE_ROLES)
  @Implement(contract.suggestion.withdraw)
  withdraw(@Req() request: Request) {
    return implement(contract.suggestion.withdraw).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.withdraw(scope, viewerOf(request), input.id),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_DECIDE_ROLES)
  @Implement(contract.suggestion.accept)
  accept(@Req() request: Request) {
    return implement(contract.suggestion.accept).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) =>
          this.service.decide(scope, viewerOf(request), input.id, {
            status: "accepted",
            note: input.note,
          }),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_DECIDE_ROLES)
  @Implement(contract.suggestion.reject)
  reject(@Req() request: Request) {
    return implement(contract.suggestion.reject).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) =>
          this.service.decide(scope, viewerOf(request), input.id, {
            status: "rejected",
            note: input.note,
          }),
        this.access,
      ),
    );
  }
}
