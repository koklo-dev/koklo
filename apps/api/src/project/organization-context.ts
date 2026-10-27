import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Request } from "express";
import { sessionOf } from "../auth/session.guard.ts";

export const ORGANIZATION_CONTEXT = Symbol("ORGANIZATION_CONTEXT");

/** Organisation pour laquelle la requête courante agit. */
export interface OrganizationContext {
  organizationId(request: Request): Promise<string>;
}

/**
 * Organisation de la session résolue par le garde. Elle ne vient jamais du client (corps, query,
 * en-tête) : sans session posée par le garde, la requête est refusée (401).
 */
@Injectable()
export class SessionOrganizationContext implements OrganizationContext {
  async organizationId(request: Request): Promise<string> {
    const session = sessionOf(request);
    if (!session) {
      throw new ORPCError("UNAUTHORIZED", { message: "Session absente ou expirée" });
    }
    return session.organizationId;
  }
}
