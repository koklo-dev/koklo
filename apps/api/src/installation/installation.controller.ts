import { contract } from "@koklo/contract";
import { Controller, Inject, Req, UseGuards } from "@nestjs/common";
import { Implement } from "@orpc/nest";
import { implement } from "@orpc/server";
import type { Request } from "express";
import { MANAGER_ROLES } from "../auth/roles.ts";
import { RoleGuard, Roles, requireSession, SessionGuard } from "../auth/session.guard.ts";
import { guard, requestIdOf } from "../request-context.ts";
import { InstallationService } from "./installation.service.ts";

/** Installer l'App et lire ses installations : `MANAGER_ROLES` (CDC §14, « fournisseurs »). */
@Controller()
export class InstallationController {
  constructor(@Inject(InstallationService) private readonly service: InstallationService) {}

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.installation.list)
  list(@Req() request: Request) {
    return implement(contract.installation.list).handler(({ errors }) =>
      guard(requestIdOf(request), errors, () => this.service.list(requireSession(request))),
    );
  }

  @UseGuards(SessionGuard, RoleGuard)
  @Roles(...MANAGER_ROLES)
  @Implement(contract.installation.start)
  start(@Req() request: Request) {
    return implement(contract.installation.start).handler(({ input, errors }) =>
      guard(requestIdOf(request), errors, () => this.service.start(requireSession(request), input)),
    );
  }
}
