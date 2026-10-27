import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";

export const ORGANIZATION_CONTEXT = Symbol("ORGANIZATION_CONTEXT");

/** Organisation pour laquelle la requête courante agit. */
export interface OrganizationContext {
  organizationId(): Promise<string>;
}

/**
 * Implémentation fermée par défaut : sans session, aucune organisation n'est connue, donc 401.
 * TODO(TK-11): remplacer par l'organisation active de la session Better Auth.
 */
@Injectable()
export class DenyOrganizationContext implements OrganizationContext {
  async organizationId(): Promise<string> {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Session absente ou expirée",
    });
  }
}
