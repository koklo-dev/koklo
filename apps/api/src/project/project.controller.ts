import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { inProject } from "../tracker/scope.ts";
import { ProjectService } from "./project.service.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "./project-access.ts";
import { ProjectCardsService } from "./project-cards.service.ts";
import { ProjectCreationService } from "./project-creation.service.ts";
import { ProjectShellService } from "./project-shell.service.ts";

@Controller()
export class ProjectController {
  constructor(
    @Inject(ProjectService) private readonly service: ProjectService,
    @Inject(ProjectShellService) private readonly shells: ProjectShellService,
    @Inject(ProjectCardsService) private readonly cardsService: ProjectCardsService,
    @Inject(ProjectCreationService) private readonly creations: ProjectCreationService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard)
  @Implement(contract.project.list)
  list(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.project.list).handler(({ errors }) =>
      guard(requestId, errors, async () => {
        const session = requireSession(request);
        const linked = await this.access.linkedProjectIds(session);
        return this.service.listVisible(session.organizationId, linked);
      }),
    );
  }

  /** Option prudente (H1) : owner et admin seulement, rôle relu en base. */
  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.project.create)
  create(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.project.create).handler(({ input, errors }) =>
      guard(requestId, errors, () =>
        this.creations.create(requireSession(request), input, fromNodeHeaders(request.headers)),
      ),
    );
  }

  /** Liste en cartes (TK-93) : tout rôle ayant accès, le client ne reçoit que ses projets. */
  @UseGuards(SessionGuard)
  @Implement(contract.project.cards)
  cards(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.project.cards).handler(({ input, errors }) =>
      guard(requestId, errors, async () => {
        const session = requireSession(request);
        const linked = await this.access.linkedProjectIds(session);
        return this.cardsService.cards(session, linked, input);
      }),
    );
  }

  /** État de la création du dépôt de spec : `null` sans ligne ; 404 uniforme hors accès. */
  @UseGuards(SessionGuard)
  @Implement(contract.project.creationStatus)
  creationStatus(@Req() request: Request) {
    return implement(contract.project.creationStatus).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.creations.status(scope, requireSession(request).role),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.project.retryRepo)
  retryRepo(@Req() request: Request) {
    return implement(contract.project.retryRepo).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.creations.retry(scope, requireSession(request).role, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.project.setEuOnly)
  setEuOnly(@Req() request: Request) {
    return implement(contract.project.setEuOnly).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.creations.setEuOnly(scope, input.euOnly),
        this.access,
      ),
    );
  }

  /** Coquille (TK-88) : agrégats sans contenu de spec, tout rôle ayant accès au projet (404 sinon). */
  @UseGuards(SessionGuard)
  @Implement(contract.project.shell)
  shell(@Req() request: Request) {
    return implement(contract.project.shell).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) => this.shells.shell(scope), this.access),
    );
  }

  /** Préférence personnelle (dernier projet ouvert) : non journalisée, ouverte à tout rôle ayant accès. */
  @UseGuards(SessionGuard)
  @Implement(contract.project.visit)
  visit(@Req() request: Request) {
    return implement(contract.project.visit).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) => this.shells.visit(scope), this.access),
    );
  }

  @UseGuards(SessionGuard)
  @Implement(contract.project.recent)
  recent(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.project.recent).handler(({ errors }) =>
      guard(requestId, errors, async () => {
        const session = requireSession(request);
        const linked = await this.access.linkedProjectIds(session);
        return this.shells.recent(session, linked);
      }),
    );
  }
}
