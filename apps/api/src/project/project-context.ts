import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Request } from "express";
import { requireSession } from "../auth/session.guard.ts";
import { DatabaseService } from "../database/database.module.ts";

export const PROJECT_CONTEXT = Symbol("PROJECT_CONTEXT");

/** Projet pour lequel la requête courante agit (tickets, sprints, dépendances). */
export interface ProjectContext {
  projectId(request: Request): Promise<string>;
}

/**
 * Implémentation v1 (H2 de TK-30) : ni la session ni le contrat ne portent de projet, on prend le
 * plus ancien projet de l'organisation de la session (`createdAt`, puis `id`). Elle ne vient jamais
 * du client. Une organisation sans projet : NOT_FOUND. La sélection explicite remplacera cette
 * classe sans toucher aux services.
 */
@Injectable()
export class OldestProjectContext implements ProjectContext {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async projectId(request: Request): Promise<string> {
    const { organizationId } = requireSession(request);
    const project = await withOrganization(organizationId, () =>
      this.database.client.project.findFirst({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      }),
    );
    if (!project) {
      throw new ORPCError("NOT_FOUND", { message: "Ressource introuvable" });
    }
    return project.id;
  }
}
