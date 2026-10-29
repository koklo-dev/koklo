import type { OrganizationListOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";

/**
 * Organisations et appartenances : modèles hors filtre multi-tenant (racine des organisations,
 * `TENANT_EXCLUDED_MODELS`), toujours bornés ici par `userId` ou par `slug`.
 */
@Injectable()
export class OrganizationRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async slugExists(slug: string): Promise<boolean> {
    const found = await this.database.client.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    return found !== null;
  }

  /** Slugs commençant par `base` (candidats à la collision). */
  async slugsStartingWith(base: string): Promise<Set<string>> {
    const rows = await this.database.client.organization.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    return new Set(rows.map((row) => row.slug));
  }

  async listForUser(userId: string): Promise<OrganizationListOutput> {
    const members = await this.database.client.member.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
    });
    return members.map(({ role, organization }) => ({
      ...organization,
      role: role as OrganizationListOutput[number]["role"],
    }));
  }
}
