import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { MANAGER_ROLES, ORG_READ_ROLES } from "../auth/roles.ts";
import {
  RoleGuard,
  Roles,
  requireSession,
  requireUserSession,
  SessionGuard,
  UserSessionGuard,
} from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { NotClientOnlyGuard } from "./not-client-only.guard.ts";
import { OrganizationService } from "./organization.service.ts";

/**
 * Création et liste : session seule, organisation active facultative. La création est refusée à un
 * compte qui n'est que client (TK-55). `org.get` (membres hors client) et `org.update` (owner et
 * admin) exigent l'organisation active et relisent le rôle dans `members` (TK-97).
 */
@Controller()
@UseGuards(UserSessionGuard)
export class OrganizationController {
  constructor(@Inject(OrganizationService) private readonly service: OrganizationService) {}

  @Implement(contract.organization.create)
  @UseGuards(NotClientOnlyGuard)
  create(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.organization.create).handler(({ input, errors }) =>
      guard(requestId, errors, async () => {
        return this.service.create(
          input,
          requireUserSession(request),
          fromNodeHeaders(request.headers),
        );
      }),
    );
  }

  @Implement(contract.organization.list)
  list(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.organization.list).handler(({ errors }) =>
      guard(requestId, errors, async () => this.service.list(requireUserSession(request).userId)),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...ORG_READ_ROLES)
  @Implement(contract.org.get)
  get(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.org.get).handler(({ errors }) =>
      guard(requestId, errors, () => this.service.get(requireSession(request))),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.org.update)
  update(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.org.update).handler(({ input, errors }) =>
      guard(requestId, errors, () => this.service.update(requireSession(request), input)),
    );
  }
}
