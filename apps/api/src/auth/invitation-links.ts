import { type PrismaClient, withOrganization, withTenantIsolation } from "@koklo/db";
import { PROJECT_INVITATION_ROLES } from "./roles.ts";

/** Ce que Better Auth passe au hook après l'acceptation (champs utilisés seulement). */
export interface Accepted {
  invitation: { id: string; organizationId: string; role: string | null; inviterId: string };
  member: { id: string; userId: string };
}

/**
 * Crée les liens `project_client_access` des projets proposés à l'invitation (client et business, B98) dans
 * UNE transaction. Si elle échoue, l'acceptation est défaite : le membre disparaît et l'invitation redevient
 * `pending` (« jamais d'accès partiel ») avant de relancer l'erreur.
 */
export function createAcceptanceHook(prisma: PrismaClient) {
  return async ({ invitation, member }: Accepted): Promise<void> => {
    if (!PROJECT_INVITATION_ROLES.some((role) => role === invitation.role)) {
      return;
    }
    try {
      await withOrganization(invitation.organizationId, () =>
        withTenantIsolation(prisma).$transaction(async (tx) => {
          const proposed = await tx.invitationProject.findMany({
            where: { invitationId: invitation.id },
            select: { projectId: true },
          });
          await tx.projectClientAccess.createMany({
            data: proposed.map(({ projectId }) => ({
              organizationId: invitation.organizationId,
              projectId,
              userId: member.userId,
              createdByUserId: invitation.inviterId,
            })),
            skipDuplicates: true,
          });
        }),
      );
    } catch (error) {
      await undoAcceptance(prisma, invitation, member);
      throw error;
    }
  };
}

async function undoAcceptance(
  prisma: PrismaClient,
  invitation: Accepted["invitation"],
  member: Accepted["member"],
): Promise<void> {
  await prisma.$transaction([
    prisma.member.deleteMany({ where: { id: member.id } }),
    prisma.session.updateMany({
      where: { userId: member.userId, activeOrganizationId: invitation.organizationId },
      data: { activeOrganizationId: null },
    }),
    prisma.invitation.updateMany({
      where: { id: invitation.id, status: "accepted" },
      data: { status: "pending" },
    }),
  ]);
}
