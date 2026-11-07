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

/**
 * Lecture : équipe et business, jamais le client (B1) ; invitation, changement de rôle et retrait : owner et
 * admin. `invite`, `list` et `setRole` sont dépréciées depuis 2.2.0 (B95) : mêmes services que les routes nouvelles.
 */
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
  @Roles(...MEMBER_LIST_ROLES)
  @Implement(contract.member.page)
  page(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.member.page).handler(({ input, errors }) =>
      guard(requestId, errors, () => this.service.page(requireSession(request), input)),
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

  @UseGuards(RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.member.updateRole)
  updateRole(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.member.updateRole).handler(({ input, errors }) =>
      guard(requestId, errors, () =>
        this.service.updateRole(requireSession(request), input.memberId, input.role),
      ),
    );
  }

  @UseGuards(RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.member.remove)
  remove(@Req() request: Request) {
    const requestId = requestIdOf(request);
    return implement(contract.member.remove).handler(({ input, errors }) =>
      guard(requestId, errors, () => this.service.remove(requireSession(request), input.memberId)),
    );
  }
}
