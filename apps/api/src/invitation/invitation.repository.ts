import type { InvitationOutput } from "@koklo/contract";
import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { type AuditActor, recordAudit } from "../tracker/audit.ts";

interface PendingRow {
  id: string;
  email: string;
  role: string | null;
  expiresAt: Date;
  inviter: { name: string };
}

/** Invitation vivante prête à être renvoyée : faits du job d'envoi et projets proposés. */
export interface LiveInvitation {
  view: InvitationOutput;
  organizationName: string;
}

/**
 * Invitations et projets proposés. `Invitation` est hors filtre multi-tenant (plugin Better Auth) : chaque
 * requête porte donc `organizationId`, toujours celui de la session. `InvitationProject` est un modèle d'organisation.
 */
@Injectable()
export class InvitationRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** Nombre de ces projets qui appartiennent à l'organisation (les autres sont inconnus : 404 uniforme). */
  countProjects(organizationId: string, projectIds: readonly string[]): Promise<number> {
    return withOrganization(organizationId, () =>
      this.database.client.project.count({ where: { id: { in: [...projectIds] } } }),
    );
  }

  async isMemberByEmail(organizationId: string, email: string): Promise<boolean> {
    const found = await this.database.client.member.findFirst({
      where: { organizationId, user: { email: { equals: email, mode: "insensitive" } } },
      select: { id: true },
    });
    return found !== null;
  }

  /** Membre de l'organisation portant cette adresse : son identifiant d'utilisateur et son rôle. */
  async memberByEmail(
    organizationId: string,
    email: string,
  ): Promise<{ userId: string; role: string } | null> {
    return this.database.client.member.findFirst({
      where: { organizationId, user: { email: { equals: email, mode: "insensitive" } } },
      select: { userId: true, role: true },
    });
  }

  /** Invitation vivante pour cette adresse (la plus récente) : on y ajoute le projet plutôt que d'en créer une. */
  async liveInvitationId(organizationId: string, email: string): Promise<string | null> {
    const found = await this.database.client.invitation.findFirst({
      where: {
        organizationId,
        status: "pending",
        expiresAt: { gt: new Date() },
        email: { equals: email, mode: "insensitive" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true },
    });
    return found?.id ?? null;
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

  /** Projets proposés + audit `member.invite` dans UNE transaction (l'invitation vient d'être créée par Better Auth). */
  record(actor: AuditActor, invitationId: string, projectIds: readonly string[]): Promise<void> {
    return withOrganization(actor.organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        if (projectIds.length > 0) {
          await tx.invitationProject.createMany({
            data: projectIds.map((projectId) => ({
              invitationId,
              projectId,
              organizationId: actor.organizationId,
            })),
          });
        }
        await recordAudit(tx, actor, {
          action: "member.invite",
          targetKind: "invitation",
          targetId: invitationId,
        });
      }),
    );
  }

  /** Compense une invitation dont les projets n'ont pas pu être enregistrés : elle disparaît, jamais d'accès partiel. */
  async discard(organizationId: string, invitationId: string): Promise<void> {
    await this.database.client.invitation.deleteMany({
      where: { id: invitationId, organizationId },
    });
  }

  async userName(userId: string): Promise<string> {
    const user = await this.database.client.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? "";
  }

  /** Invitations `pending` non expirées, les plus récentes d'abord, avec leurs projets. */
  async listLive(organizationId: string): Promise<InvitationOutput[]> {
    const rows = await this.database.client.invitation.findMany({
      where: { organizationId, status: "pending", expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        inviter: { select: { name: true } },
      },
    });
    const projects = await this.projectsOf(
      organizationId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toView(row, projects.get(row.id) ?? []));
  }

  async findLive(organizationId: string, invitationId: string): Promise<LiveInvitation | null> {
    const row = await this.database.client.invitation.findFirst({
      where: { id: invitationId, organizationId, status: "pending", expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        inviter: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });
    if (!row) {
      return null;
    }
    const projects = await this.projectsOf(organizationId, [row.id]);
    return {
      view: toView(row, projects.get(row.id) ?? []),
      organizationName: row.organization.name,
    };
  }

  /** `pending -> canceled` + audit `invitation.revoke` ; `false` si l'invitation n'était plus `pending`. */
  revoke(actor: AuditActor, invitationId: string): Promise<boolean> {
    return this.writeWithAudit(actor, "invitation.revoke", invitationId, (tx) =>
      tx.invitation
        .updateMany({
          where: { id: invitationId, organizationId: actor.organizationId, status: "pending" },
          data: { status: "canceled" },
        })
        .then(({ count }) => count > 0),
    );
  }

  async recordResend(actor: AuditActor, invitationId: string): Promise<void> {
    await this.writeWithAudit(actor, "invitation.resend", invitationId, async () => true);
  }

  private writeWithAudit(
    actor: AuditActor,
    action: string,
    invitationId: string,
    work: (
      tx: Parameters<Parameters<DatabaseService["client"]["$transaction"]>[0]>[0],
    ) => Promise<boolean>,
  ): Promise<boolean> {
    return withOrganization(actor.organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        const done = await work(tx);
        if (done) {
          await recordAudit(tx, actor, {
            action,
            targetKind: "invitation",
            targetId: invitationId,
          });
        }
        return done;
      }),
    );
  }

  private async projectsOf(organizationId: string, invitationIds: string[]) {
    const byInvitation = new Map<string, { id: string; name: string }[]>();
    if (invitationIds.length === 0) {
      return byInvitation;
    }
    const links = await withOrganization(organizationId, () =>
      this.database.client.invitationProject.findMany({
        where: { invitationId: { in: invitationIds } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { invitationId: true, project: { select: { id: true, name: true } } },
      }),
    );
    for (const { invitationId, project } of links) {
      byInvitation.set(invitationId, [...(byInvitation.get(invitationId) ?? []), project]);
    }
    return byInvitation;
  }
}

function toView(row: PendingRow, projects: { id: string; name: string }[]): InvitationOutput {
  return {
    id: row.id,
    email: row.email,
    role: row.role as InvitationOutput["role"],
    status: "pending",
    expiresAt: row.expiresAt.toISOString(),
    invitedBy: row.inviter.name,
    projects,
  };
}
