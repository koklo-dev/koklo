import type { MemberListOutput, Role } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";

export interface MemberRecord {
  id: string;
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

  async isMemberByEmail(organizationId: string, email: string): Promise<boolean> {
    const found = await this.database.client.member.findFirst({
      where: { organizationId, user: { email: { equals: email, mode: "insensitive" } } },
      select: { id: true },
    });
    return found !== null;
  }

  async hasLiveInvitation(organizationId: string, email: string): Promise<boolean> {
    const found = await this.database.client.invitation.findFirst({
      where: {
        organizationId,
        status: "pending",
        expiresAt: { gt: new Date() },
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Change le rôle dans une transaction sérialisable : `authorize` (qui lève pour refuser) et
   * l'écriture voient le même état, une course ne peut pas laisser l'organisation sans owner.
   * `target` est `null` si le membre n'appartient pas à l'organisation.
   */
  setRole(
    organizationId: string,
    memberId: string,
    newRole: string,
    authorize: (target: MemberRecord | null, ownerCount: number) => void,
  ): Promise<{ id: string; role: string }> {
    return this.database.client.$transaction(
      async (tx) => {
        const target = await tx.member.findFirst({
          where: { id: memberId, organizationId },
          select: { id: true, role: true },
        });
        const ownerCount = await tx.member.count({ where: { organizationId, role: "owner" } });
        authorize(target, ownerCount);
        return tx.member.update({
          where: { id: memberId },
          data: { role: newRole },
          select: { id: true, role: true },
        });
      },
      { isolationLevel: "Serializable" },
    );
  }
}
