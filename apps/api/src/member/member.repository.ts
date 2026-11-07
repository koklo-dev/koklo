import type { MemberListOutput, MemberPageInput, MemberPageOutput, Role } from "@koklo/contract";
import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { CLIENT_ROLE } from "../auth/roles.ts";
import { DatabaseService } from "../database/database.module.ts";
import { type AuditActor, recordAudit } from "../tracker/audit.ts";

export interface MemberRecord {
  id: string;
  userId: string;
  role: string;
}

/**
 * Membres et invitations : modèles hors filtre multi-tenant (`organizationId` géré par le plugin
 * Better Auth, `TENANT_EXCLUDED_MODELS`). Chaque requête porte donc elle-même `organizationId`,
 * toujours celui de la session.
 */
@Injectable()
export class MemberRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(organizationId: string): Promise<MemberListOutput> {
    const members = await this.database.client.member.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, userId: true, role: true, user: { select: { name: true, email: true } } },
    });
    return members.map(({ id, userId, role, user }) => ({
      id,
      userId,
      name: user.name,
      email: user.email,
      role: role as Role,
    }));
  }

  /**
   * Change le rôle dans une transaction sérialisable : `authorize` (qui lève pour refuser) et
   * l'écriture voient le même état, une course ne peut pas laisser l'organisation sans owner.
   * `target` est `null` si le membre n'appartient pas à l'organisation. L'audit `member.setRole`
   * s'écrit dans la même transaction : un refus ou un échec n'en laisse aucune trace.
   */
  setRole(
    actor: AuditActor,
    memberId: string,
    newRole: string,
    authorize: (target: MemberRecord | null, ownerCount: number) => void,
  ): Promise<{ id: string; role: string }> {
    const { organizationId } = actor;
    return withOrganization(organizationId, () =>
      this.database.client.$transaction(
        async (tx) => {
          const target = await tx.member.findFirst({
            where: { id: memberId, organizationId },
            select: { id: true, userId: true, role: true },
          });
          const ownerCount = await tx.member.count({ where: { organizationId, role: "owner" } });
          authorize(target, ownerCount);
          if (target?.role === CLIENT_ROLE && newRole !== CLIENT_ROLE) {
            // Sortie du rôle client : ses liens de projet tombent avec lui (jamais ceux d'une autre organisation).
            await tx.projectClientAccess.deleteMany({
              where: { organizationId, userId: target.userId },
            });
          }
          const updated = await tx.member.update({
            where: { id: memberId },
            data: { role: newRole },
            select: { id: true, role: true },
          });
          await recordAudit(tx, actor, {
            action: "member.setRole",
            targetKind: "member",
            targetId: updated.id,
          });
          return updated;
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }

  /**
   * Page numérotée des membres (tri stable par ancienneté puis identifiant). Les projets viennent des liens
   * `project_client_access` de l'organisation (client et business), la dernière activité de la session la plus
   * récente du compte (B102) ; `null` sans session.
   */
  async page(organizationId: string, input: MemberPageInput): Promise<MemberPageOutput> {
    const page = Number(input.page);
    const size = Number(input.size);
    const q = input.q;
    const where = {
      organizationId,
      ...(q
        ? {
            user: {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };
    const { client } = this.database;
    const [total, members] = await Promise.all([
      client.member.count({ where }),
      client.member.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * size,
        take: size,
        select: {
          id: true,
          userId: true,
          role: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ]);
    const userIds = members.map((member) => member.userId);
    const [projects, activity] = await Promise.all([
      this.projectsOfUsers(organizationId, userIds),
      this.lastActivity(userIds),
    ]);
    return {
      items: members.map(({ id, userId, role, user }) => ({
        id,
        userId,
        name: user.name,
        email: user.email,
        role: role as Role,
        projects: projects.get(userId) ?? [],
        lastActiveAt: activity.get(userId)?.toISOString() ?? null,
      })),
      total,
      totalIsEstimate: false,
    };
  }

  private async projectsOfUsers(organizationId: string, userIds: string[]) {
    const byUser = new Map<string, { id: string; name: string }[]>();
    const links = await withOrganization(organizationId, () =>
      this.database.client.projectClientAccess.findMany({
        where: { userId: { in: userIds } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { userId: true, project: { select: { id: true, name: true } } },
      }),
    );
    for (const { userId, project } of links) {
      byUser.set(userId, [...(byUser.get(userId) ?? []), project]);
    }
    return byUser;
  }

  private async lastActivity(userIds: string[]) {
    const rows = await this.database.client.session.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _max: { updatedAt: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row._max.updatedAt ? [[row.userId, row._max.updatedAt] as const] : [],
      ),
    );
  }

  /**
   * Retire le membre dans une transaction sérialisable : `authorize` (qui lève pour refuser) et l'écriture voient le même
   * état. Ses liens de projet, ses sessions de l'organisation et l'audit `member.remove` partent ensemble ; le compte et ses
   * autres organisations survivent. `target` est `null` si le membre n'appartient pas à l'organisation.
   */
  remove(
    actor: AuditActor,
    memberId: string,
    authorize: (target: MemberRecord | null, ownerCount: number) => void,
  ): Promise<{ id: string }> {
    const { organizationId } = actor;
    return withOrganization(organizationId, () =>
      this.database.client.$transaction(
        async (tx) => {
          const target = await tx.member.findFirst({
            where: { id: memberId, organizationId },
            select: { id: true, userId: true, role: true },
          });
          const ownerCount = await tx.member.count({ where: { organizationId, role: "owner" } });
          authorize(target, ownerCount);
          if (target) {
            await tx.projectClientAccess.deleteMany({ where: { userId: target.userId } });
            await tx.session.deleteMany({
              where: { userId: target.userId, activeOrganizationId: organizationId },
            });
            await tx.member.delete({ where: { id: memberId } });
          }
          await recordAudit(tx, actor, {
            action: "member.remove",
            targetKind: "member",
            targetId: memberId,
          });
          return { id: memberId };
        },
        { isolationLevel: "Serializable" },
      ),
    );
  }
}
