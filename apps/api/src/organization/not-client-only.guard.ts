import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Request } from "express";
import { CLIENT_ROLE } from "../auth/roles.ts";
import { requireUserSession } from "../auth/session.guard.ts";
import { OrganizationRepository } from "./organization.repository.ts";

/**
 * TK-55 (décision du 2026-11-06) : un compte dont toutes les adhésions sont « client » ne crée pas
 * d'organisation. Un compte sans adhésion (premier usage) ou avec au moins un autre rôle le peut.
 * Garde de méthode, après `UserSessionGuard` : le refus tombe avant la validation de l'entrée,
 * comme les autres refus de rôle.
 */
@Injectable()
export class NotClientOnlyGuard implements CanActivate {
  constructor(
    @Inject(OrganizationRepository) private readonly repository: OrganizationRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { userId } = requireUserSession(context.switchToHttp().getRequest<Request>());
    const roles = await this.repository.rolesOfUser(userId);
    if (roles.length > 0 && roles.every((role) => role === CLIENT_ROLE)) {
      throw new ORPCError("FORBIDDEN", { data: { reason: "client_only" } });
    }
    return true;
  }
}
