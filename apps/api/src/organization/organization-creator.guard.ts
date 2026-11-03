import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Request } from "express";
import { mayCreateOrganization } from "../auth/roles.ts";
import { requireUserSession } from "../auth/session.guard.ts";
import { OrganizationRepository } from "./organization.repository.ts";

/**
 * Garde de `organization.create` (TK-55e), après `UserSessionGuard` et AVANT la validation de
 * l'entrée : un client ne crée pas d'organisation. Les rôles sont relus dans `members` à chaque
 * requête (jamais depuis l'entrée ni la session) ; refus uniforme, sans détail ni autre organisation.
 */
@Injectable()
export class OrganizationCreatorGuard implements CanActivate {
  constructor(
    @Inject(OrganizationRepository) private readonly repository: OrganizationRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { userId } = requireUserSession(context.switchToHttp().getRequest<Request>());
    if (!mayCreateOrganization(await this.repository.rolesOfUser(userId))) {
      throw new ORPCError("FORBIDDEN", { message: "Accès refusé" });
    }
    return true;
  }
}
