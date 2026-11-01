import { Inject, Injectable } from "@nestjs/common";
import { recordAudit } from "../tracker/audit.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { ProjectClientRecord, ProjectClientRepository } from "./project-client.repository.ts";

const LINK_SELECT = {
  id: true,
  userId: true,
  createdAt: true,
  member: { select: { id: true, user: { select: { name: true, email: true } } } },
} as const;

type LinkRow = {
  userId: string;
  createdAt: Date;
  member: { id: string; user: { name: string; email: string } };
};

const recordOf = ({ userId, createdAt, member }: LinkRow): ProjectClientRecord => ({
  memberId: member.id,
  userId,
  name: member.user.name,
  email: member.user.email,
  createdAt,
});

/**
 * `Member` est hors filtre multi-tenant (géré par Better Auth) : chaque lecture porte donc
 * `organizationId`, toujours celui de la session. Les liens, eux, sont filtrés par l'extension.
 */
@Injectable()
export class PrismaProjectClientRepository implements ProjectClientRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  list(scope: ProjectScope): Promise<ProjectClientRecord[]> {
    return this.transactions.run(scope, async (tx) => {
      const rows = await tx.projectClientAccess.findMany({
        where: { projectId: scope.projectId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: LINK_SELECT,
      });
      return rows.map(recordOf);
    });
  }

  add(scope: ProjectScope, memberId: string): Promise<ProjectClientRecord | null> {
    return this.transactions.run(scope, async (tx) => {
      // Verrou de ligne (le client tenant refuse le SQL brut) : un UPDATE sans effet pose le verrou
      // et, en READ COMMITTED, réévalue `role = 'client'` après l'attente d'un `member.setRole`
      // concurrent. Le rôle lu ici est donc encore vrai à l'INSERT (TK-55 N1, pas de lien orphelin).
      const locked = await tx.member.updateMany({
        where: { id: memberId, organizationId: scope.organizationId, role: "client" },
        data: { role: "client" },
      });
      const member =
        locked.count === 0
          ? null
          : await tx.member.findFirst({
              where: { id: memberId, organizationId: scope.organizationId, role: "client" },
              select: { userId: true },
            });
      if (!member) {
        return null;
      }
      const { count } = await tx.projectClientAccess.createMany({
        data: [
          {
            organizationId: scope.organizationId,
            projectId: scope.projectId,
            userId: member.userId,
            createdByUserId: scope.userId,
          },
        ],
        skipDuplicates: true,
      });
      const link = await tx.projectClientAccess.findFirstOrThrow({
        where: { projectId: scope.projectId, userId: member.userId },
        select: LINK_SELECT,
      });
      if (count > 0) {
        await auditLink(tx, scope, "project_client.add", link.id);
      }
      return recordOf(link);
    });
  }

  remove(scope: ProjectScope, memberId: string): Promise<boolean> {
    return this.transactions.run(scope, async (tx) => {
      const member = await tx.member.findFirst({
        where: { id: memberId, organizationId: scope.organizationId },
        select: { userId: true },
      });
      const link = member
        ? await tx.projectClientAccess.findFirst({
            where: { projectId: scope.projectId, userId: member.userId },
            select: { id: true },
          })
        : null;
      if (!link) {
        return false;
      }
      const { count } = await tx.projectClientAccess.deleteMany({ where: { id: link.id } });
      if (count > 0) {
        await auditLink(tx, scope, "project_client.remove", link.id);
      }
      return count > 0;
    });
  }
}

function auditLink(
  tx: Tx,
  scope: ProjectScope,
  action: "project_client.add" | "project_client.remove",
  targetId: string,
): Promise<void> {
  return recordAudit(tx, scope, { action, targetKind: "project_client", targetId });
}
