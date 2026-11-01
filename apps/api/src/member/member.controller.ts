import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { MANAGER_ROLES, MEMBER_LIST_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { MemberService } from "./member.service.ts";

/** Lecture : équipe et business, jamais le client (B1) ; invitation et changement de rôle : owner et admin. */
@Controller()
@UseGuards(SessionGuard)
export class MemberController {
  constructor(@Inject(MemberService) private readonly service: MemberService) {}

  @UseGuards(RoleGuard)
  @Roles(...MEMBER_LIST_ROLES)
  @Implement(contract.member.list)
  list(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.member.list).handler(({ errors }) =>
      guard(requestId, errors, async () => this.service.list(requireSession(request))),
    );
  }

  @UseGuards(RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.member.invite)
  invite(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.member.invite).handler(({ input, errors }) =>
      guard(requestId, errors, async () =>
        this.service.invite(requireSession(request), input, fromNodeHeaders(request.headers)),
      ),
    );
  }

  @UseGuards(RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.member.setRole)
  setRole(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.member.setRole).handler(({ input, errors }) =>
      guard(requestId, errors, async () =>
        this.service.setRole(requireSession(request), input.memberId, input.role),
      ),
    );
  }
}
