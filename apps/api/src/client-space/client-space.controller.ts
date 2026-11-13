import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { CLIENT_SPACE_READ_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { PROJECT_ACCESS, type ProjectAccess } from "../project/project-access.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { inProject } from "../tracker/scope.ts";
import { ClientSpaceService } from "./client-space.service.ts";
import { ClientSpaceDataService } from "./client-space-data.service.ts";
import { ClientSpaceEntitiesService } from "./client-space-entities.service.ts";

/**
 * Lectures de l'espace client (CDC §14, TK-55b) : les six rôles. Le client n'atteint que ses projets
 * liés, les autres rôles toute leur organisation ; un projet inaccessible est un 404 uniforme.
 */
@Controller()
export class ClientSpaceController {
  constructor(
    @Inject(ClientSpaceService) private readonly service: ClientSpaceService,
    @Inject(ClientSpaceEntitiesService) private readonly entities: ClientSpaceEntitiesService,
    @Inject(ClientSpaceDataService) private readonly data: ClientSpaceDataService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.projects)
  projects(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.clientSpace.projects).handler(({ errors }) =>
      guard(requestId, errors, async () => {
        const session = requireSession(request);
        const linked = await this.access.linkedProjectIds(session);
        return this.service.projects(session.organizationId, linked);
      }),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.features)
  features(@Req() request: Request) {
    return implement(contract.clientSpace.features).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.features(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.feature)
  feature(@Req() request: Request) {
    return implement(contract.clientSpace.feature).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.service.feature(scope, input.featureId),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.progress)
  progress(@Req() request: Request) {
    return implement(contract.clientSpace.progress).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.entities.progress(scope, requireSession(request).role),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.flows)
  flows(@Req() request: Request) {
    return implement(contract.clientSpace.flows).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.entities.flows(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.rules)
  rules(@Req() request: Request) {
    return implement(contract.clientSpace.rules).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.entities.rules(scope, input),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.roles)
  roles(@Req() request: Request) {
    return implement(contract.clientSpace.roles).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.entities.roles(scope),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.dataModel)
  dataModel(@Req() request: Request) {
    return implement(contract.clientSpace.dataModel).handler(({ input, errors }) =>
      inProject(request, errors, input.projectId, (scope) => this.data.model(scope), this.access),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.dataFixtures)
  dataFixtures(@Req() request: Request) {
    return implement(contract.clientSpace.dataFixtures).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.data.fixtures(scope),
        this.access,
      ),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...CLIENT_SPACE_READ_ROLES)
  @Implement(contract.clientSpace.dataFixtureRows)
  dataFixtureRows(@Req() request: Request) {
    return implement(contract.clientSpace.dataFixtureRows).handler(({ input, errors }) =>
      inProject(
        request,
        errors,
        input.projectId,
        (scope) => this.data.fixtureRows(scope, input),
        this.access,
      ),
    );
  }
}
