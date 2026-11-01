import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { requireSession } from "../auth/session.guard.ts";
import { DatabaseService } from "../database/database.module.ts";
import { notFoundError, PROJECT_ACCESS, type ProjectAccess } from "./project-access.ts";

export const PROJECT_CONTEXT = Symbol("PROJECT_CONTEXT");

/** Projet pour lequel la requête courante agit (tickets, sprints, dépendances). */
export interface ProjectContext {
  projectId(request: Request): Promise<string>;
}

/**
 * Implémentation v1 (H2 de TK-30) : ni la session ni le contrat ne portent de projet, on prend le
 * plus ancien projet (`createdAt`, puis `id`) que la session atteint : toute l'organisation pour un
 * rôle d'équipe, les seuls projets liés pour un rôle cloisonné (TK-55a). Il ne vient jamais du
 * client. Aucun projet atteignable : NOT_FOUND. La sélection explicite remplacera cette classe sans
 * toucher aux services.
 */
@Injectable()
export class OldestProjectContext implements ProjectContext {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccess,
  ) {}

  async projectId(request: Request): Promise<string> {
    const session = requireSession(request);
    const linked = await this.access.linkedProjectIds(session);
    if (linked !== null) {
      const [oldest] = linked;
      if (!oldest) {
        throw notFoundError();
      }
      return oldest;
    }
    const project = await withOrganization(session.organizationId, () =>
      this.database.client.project.findFirst({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      }),
    );
    if (!project) {
      throw notFoundError();
    }
    return project.id;
  }
}
