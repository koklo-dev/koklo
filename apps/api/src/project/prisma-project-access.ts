import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { CLIENT_ROLE } from "../auth/roles.ts";
import type { AuthSession } from "../auth/session.ts";
import { DatabaseService } from "../database/database.module.ts";
import { isProjectScoped, notFoundError, type ProjectAccess } from "./project-access.ts";

/**
 * Cloisonnement par projet (TK-55a). Un seul aller-retour à la base quelle que soit la cause du
 * refus (aucun oracle de durée) : le projet est lu avec, pour un rôle cloisonné, la condition de
 * lien. Un rôle cloisonné autre que `client` (absent, inconnu) n'a jamais de lien : refus d'office.
 */
@Injectable()
export class PrismaProjectAccess implements ProjectAccess {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async assertAccessible(session: AuthSession, projectId: string): Promise<void> {
    const { organizationId, userId, role } = session;
    const scoped = isProjectScoped(role);
    if (scoped && role !== CLIENT_ROLE) {
      throw notFoundError();
    }
    const project = await withOrganization(organizationId, () =>
      this.database.client.project.findFirst({
        where: {
          id: projectId,
          ...(scoped ? { clientAccess: { some: { organizationId, userId } } } : {}),
        },
        select: { id: true },
      }),
    );
    if (!project) {
      throw notFoundError();
    }
  }

  async linkedProjectIds(session: AuthSession): Promise<string[] | null> {
    const { organizationId, userId, role } = session;
    if (!isProjectScoped(role)) {
      return null;
    }
    if (role !== CLIENT_ROLE) {
      return [];
    }
    const links = await withOrganization(organizationId, () =>
      this.database.client.project.findMany({
        where: { clientAccess: { some: { organizationId, userId } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      }),
    );
    return links.map(({ id }) => id);
  }
}
