import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { DATA_PROPOSAL_ROLES, SPEC_BATCH_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { inProject } from "../tracker/scope.ts";
import { SpecArchitectureDiagramService } from "./spec-architecture-diagram.service.ts";

/**
 * Schéma et flux de la page Architecture (TK-112, B542 à B545) : owner, admin, développeur et designer en lecture (zones,
 * zone, recherche, mise en page, flux, YAML et Mermaid) ; client et business 403, donc jamais de YAML ni de Mermaid hors équipe.
 * `layout.save` pour ceux qui écrivent l'architecture (`DATA_PROPOSAL_ROLES` : le designer, le client et le business reçoivent
 * 403). Le rôle est refusé avant le contrôle du projet (404).
 */
@Controller()
export class SpecArchitectureDiagramController {
  constructor(
    @Inject(SpecArchitectureDiagramService)
    private readonly service: SpecArchitectureDiagramService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.zones)
  zones(@Req() request: Request) {
    return implement(contract.spec.architecture.zones).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.zones(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.zone)
  zone(@Req() request: Request) {
    return implement(contract.spec.architecture.zone).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.zone(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.search)
  search(@Req() request: Request) {
    return implement(contract.spec.architecture.search).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.search(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.layout.get)
  layout(@Req() request: Request) {
    return implement(contract.spec.architecture.layout.get).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.layout(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...DATA_PROPOSAL_ROLES)
  @Implement(contract.spec.architecture.layout.save)
  saveLayout(@Req() request: Request) {
    return implement(contract.spec.architecture.layout.save).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.saveLayout(scope, requireSession(request).role ?? "", input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.flows.list)
  flows(@Req() request: Request) {
    return implement(contract.spec.architecture.flows.list).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.flows(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.flows.byId)
  flow(@Req() request: Request) {
    return implement(contract.spec.architecture.flows.byId).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.flow(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...SPEC_BATCH_ROLES)
  @Implement(contract.spec.architecture.source)
  source(@Req() request: Request) {
    return implement(contract.spec.architecture.source).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.source(scope, input),
        this.access,
      ),
    );
  }
}
