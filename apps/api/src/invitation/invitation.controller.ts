import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { InvitationService } from "./invitation.service.ts";

/** Invitations : owner et admin seulement (le rôle vient de `members`, jamais de l'entrée). */
@Controller()
@UseGuards(SessionGuard, RoleGuard)
@Roles(...MANAGER_ROLES)
export class InvitationController {
  constructor(@Inject(InvitationService) private readonly service: InvitationService) {}

  @Implement(contract.invitation.create)
  create(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.invitation.create).handler(({ input, errors }) =>
      guard(requestId, errors, () =>
        this.service.create(requireSession(request), input, fromNodeHeaders(request.headers)),
      ),
    );
  }

  @Implement(contract.invitation.list)
  list(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.invitation.list).handler(({ errors }) =>
      guard(requestId, errors, () => this.service.list(requireSession(request))),
    );
  }

  @Implement(contract.invitation.resend)
  resend(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.invitation.resend).handler(({ input, errors }) =>
      guard(requestId, errors, () =>
        this.service.resend(requireSession(request), input.invitationId),
      ),
    );
  }

  @Implement(contract.invitation.revoke)
  revoke(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.invitation.revoke).handler(({ input, errors }) =>
      guard(requestId, errors, () =>
        this.service.revoke(requireSession(request), input.invitationId),
      ),
    );
  }
}
