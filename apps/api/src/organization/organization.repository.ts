import type {
  OrganizationListOutput,
  OrgGetOutput,
  OrgUpdateInput,
  OrgUpdateOutput,
} from "@koklo/contract";
import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { type AuditActor, recordAudit } from "../tracker/audit.ts";

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

  /** Rôles de l'utilisateur dans toutes ses organisations (vide s'il n'est membre d'aucune). */
  async rolesOfUser(userId: string): Promise<string[]> {
    const members = await this.database.client.member.findMany({
      where: { userId },
      select: { role: true },
    });
    return members.map(({ role }) => role);
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

  /**
   * Crée l'organisation, son membre `owner` et l'entrée d'audit `organization.create` dans UNE
   * transaction : tout ou rien. L'audit est écrit dans la nouvelle organisation (c'est la seule
   * qui existe à cet instant).
   */
  createWithOwner(
    userId: string,
    organization: { name: string; slug: string },
  ): Promise<{ id: string; name: string; slug: string }> {
    return this.database.client.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: organization,
        select: { id: true, name: true, slug: true },
      });
      await tx.member.create({ data: { organizationId: created.id, userId, role: "owner" } });
      await withOrganization(created.id, () =>
        recordAudit(
          tx,
          { organizationId: created.id, userId },
          { action: "organization.create", targetKind: "organization", targetId: created.id },
        ),
      );
      return created;
    });
  }

  /** Faits de Général : compteurs réels. Le nombre de clés d'IA ne dit rien du fournisseur. */
  async get(organizationId: string): Promise<OrgGetOutput> {
    const { client } = this.database;
    const organization = await client.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, logo: true },
    });
    const [memberCount, projectCount, aiProviderCount] = await Promise.all([
      client.member.count({ where: { organizationId } }),
      withOrganization(organizationId, () => client.project.count()),
      withOrganization(organizationId, () => client.llmProviderCredential.count()),
    ]);
    return { ...organization, projectCount, memberCount, aiProviderCount };
  }

  async slugTakenByAnother(organizationId: string, slug: string): Promise<boolean> {
    const found = await this.database.client.organization.findFirst({
      where: { slug, id: { not: organizationId } },
      select: { id: true },
    });
    return found !== null;
  }

  /** Nom, slug et audit `organization.update` en UNE transaction ; `onTaken` lève si un autre possède déjà ce slug. */
  update(actor: AuditActor, input: OrgUpdateInput, onTaken: () => Error): Promise<OrgUpdateOutput> {
    const { organizationId } = actor;
    return withOrganization(organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        if (await this.slugTakenByAnother(organizationId, input.slug)) {
          throw onTaken();
        }
        const updated = await tx.organization.update({
          where: { id: organizationId },
          data: { name: input.name, slug: input.slug },
          select: { id: true, name: true, slug: true },
        });
        await recordAudit(tx, actor, {
          action: "organization.update",
          targetKind: "organization",
          targetId: organizationId,
        });
        return updated;
      }),
    );
  }
}
