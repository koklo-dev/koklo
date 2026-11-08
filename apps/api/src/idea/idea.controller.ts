import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { IDEA_READ_ROLES, IDEA_WRITE_ROLES, SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import type { InternalErrors } from "../request-context.ts";
import { inProject, type ProjectScope } from "../tracker/scope.ts";
import { IdeaService } from "./idea.service.ts";

type Work<T> = (scope: ProjectScope, role: string | undefined) => Promise<T>;

/**
 * Espace Idée (TK-89). Ordre : garde de rôle (403), projet atteignable (404 uniforme, le client n'atteint
 * que ses projets liés), puis la page (404). Lecture : six rôles ; rédaction : `IDEA_WRITE_ROLES` (le business
 * lit seulement) ; publication : `SPEC_BATCH_ROLES` (ni le client ni le business).
 */
@Controller()
export class IdeaController {
  constructor(
    @Inject(IdeaService) private readonly service: IdeaService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  private scoped<T>(request: Request, errors: InternalErrors, projectId: string, work: Work<T>) {
    return inProject(
      request,
      errors,
      projectId,
      (scope) => work(scope, requireSession(request).role),
      this.access,
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_READ_ROLES)
  @Implement(contract.idea.list)
  list(@Req() request: Request) {
    return implement(contract.idea.list).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope) => this.service.list(scope)),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_READ_ROLES)
  @Implement(contract.idea.get)
  get(@Req() request: Request) {
    return implement(contract.idea.get).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope) =>
        this.service.get(scope, input.pageId),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.save)
  save(@Req() request: Request) {
    return implement(contract.idea.save).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, role) =>
        this.service.save(scope, role, input),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.setStatus)
  setStatus(@Req() request: Request) {
    return implement(contract.idea.setStatus).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, role) =>
        this.service.setStatus(scope, role, input),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.idea.publish)
  publish(@Req() request: Request) {
    return implement(contract.idea.publish).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, role) =>
        this.service.publish(scope, role, input.idempotencyKey),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.presence)
  presence(@Req() request: Request) {
    return implement(contract.idea.presence).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope) =>
        this.service.presence(scope, input.pageId),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.page.create)
  createPage(@Req() request: Request) {
    return implement(contract.idea.page.create).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, role) =>
        this.service.createPage(scope, role, input),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.page.rename)
  rename(@Req() request: Request) {
    return implement(contract.idea.page.rename).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, role) =>
        this.service.rename(scope, role, input),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.page.reorder)
  reorder(@Req() request: Request) {
    return implement(contract.idea.page.reorder).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, role) =>
        this.service.reorder(scope, role, input.pageIds),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.page.delete)
  remove(@Req() request: Request) {
    return implement(contract.idea.page.delete).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, role) =>
        this.service.remove(scope, role, input.pageId),
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...IDEA_WRITE_ROLES)
  @Implement(contract.idea.page.restore)
  restore(@Req() request: Request) {
    return implement(contract.idea.page.restore).handler(({ input, errors }) =>
      this.scoped(request, errors, input.projectId, (scope, role) =>
        this.service.restore(scope, role, input.pageId),
      ),
    );
  }
}
