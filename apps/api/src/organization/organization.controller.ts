import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { requireUserSession, UserSessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { OrganizationService } from "./organization.service.ts";
import { OrganizationCreatorGuard } from "./organization-creator.guard.ts";

/**
 * Liste : session seule. Création : session seule aussi (première organisation), mais fermée à
 * l'utilisateur dont toutes les appartenances sont `client` (`OrganizationCreatorGuard`, TK-55e).
 */
@Controller()
@UseGuards(UserSessionGuard)
export class OrganizationController {
  constructor(@Inject(OrganizationService) private readonly service: OrganizationService) {}

  @Implement(contract.organization.create)
  @UseGuards(OrganizationCreatorGuard)
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
}
