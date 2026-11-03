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
import type { InternalErrors } from "../request-context.ts";
import { inProject, type ProjectScope } from "../tracker/scope.ts";
import { SuggestionService } from "./suggestion.service.ts";

type Decision = "accepted" | "rejected";

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

  /** Projet atteignable d'abord (404 uniforme), puis le travail dans la portée de la session. */
  private scoped<T>(
    request: Request,
    errors: InternalErrors,
    projectId: string,
    work: (scope: ProjectScope, viewer: ReturnType<typeof viewerOf>) => Promise<T>,
  ): Promise<T> {
    return inProject(
      request,
      errors,
      projectId,
      (scope) => work(scope, viewerOf(request)),
      this.access,
    );
  }

  private decide(request: Request, status: Decision) {
    const procedure =
      status === "accepted" ? contract.suggestion.accept : contract.suggestion.reject;
    return implement(procedure).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, viewer) =>
        this.service.decide(scope, viewer, input.id, { status, note: input.note }),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_CREATE_ROLES)
  @Implement(contract.suggestion.create)
  create(@Req() request: Request) {
    return implement(contract.suggestion.create).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, viewer) =>
        this.service.create(scope, viewer, input),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_READ_ROLES)
  @Implement(contract.suggestion.list)
  list(@Req() request: Request) {
    return implement(contract.suggestion.list).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, viewer) =>
        this.service.list(scope, viewer, input),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_CREATE_ROLES)
  @Implement(contract.suggestion.withdraw)
  withdraw(@Req() request: Request) {
    return implement(contract.suggestion.withdraw).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, viewer) =>
        this.service.withdraw(scope, viewer, input.id),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_DECIDE_ROLES)
  @Implement(contract.suggestion.accept)
  accept(@Req() request: Request) {
    return this.decide(request, "accepted");
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SUGGESTION_DECIDE_ROLES)
  @Implement(contract.suggestion.reject)
  reject(@Req() request: Request) {
    return this.decide(request, "rejected");
  }
}
