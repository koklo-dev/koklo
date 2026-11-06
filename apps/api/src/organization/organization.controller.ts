import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { requireUserSession, UserSessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { NotClientOnlyGuard } from "./not-client-only.guard.ts";
import { OrganizationService } from "./organization.service.ts";

/**
 * Création et liste : session seule, organisation active facultative. La création est refusée à un
 * compte qui n'est que client (TK-55).
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
}
