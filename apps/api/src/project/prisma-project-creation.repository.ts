import { withOrganization } from "@koklo/db";
import type { ProjectCreationErrorCode, ProjectCreationStatus } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { IDEA_TEMPLATE } from "../idea/idea-template.ts";
import { isUniqueViolation } from "../tracker/api-errors.ts";
import { type AuditActor, recordAudit } from "../tracker/audit.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  CreatedProject,
  InstallationChoice,
  LatestCreation,
  NewProject,
  ProjectCreationRepository,
  RetryOutcome,
  RetryRequest,
} from "./project-creation.repository.ts";

const REQUIRED_ONLY = IDEA_TEMPLATE.filter((entry) => entry.required);

/** Pages du gabarit : les 10 pages (défaut) ou les 4 requises seules (gabarit vide). */
const pagesOf = (template: NewProject["ideaTemplate"]) =>
  template === "empty" ? REQUIRED_ONLY : IDEA_TEMPLATE;

async function insertPages(tx: Tx, organizationId: string, projectId: string, input: NewProject) {
  await tx.ideaPage.createMany({
    data: pagesOf(input.ideaTemplate).map((entry, position) => ({
      organizationId,
      projectId,
      slug: entry.slug,
      title: entry.title,
      position,
      required: entry.required,
      origin: "template" as const,
      templateKey: entry.slug,
      status: "empty" as const,
    })),
  });
}

/** Client déjà membre (accès direct) ou invitation vivante (projet ajouté) : dans la transaction de création. */
async function linkClient(tx: Tx, organizationId: string, projectId: string, input: NewProject) {
  if (input.clientUserId !== null) {
    await tx.projectClientAccess.create({
      data: { organizationId, projectId, userId: input.clientUserId },
    });
  }
  if (input.invitationId !== null) {
    await tx.invitationProject.create({
      data: { organizationId, projectId, invitationId: input.invitationId },
    });
  }
}

/** Faux code sans compte : la création est réglée tout de suite (rien à confier au worker). */
const initialState = (installationId: string | null) =>
  installationId === null
    ? { status: "skipped", errorCode: "no_account" }
    : { status: "pending", errorCode: null };

@Injectable()
export class PrismaProjectCreationRepository implements ProjectCreationRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
  ) {}

  findByKey(organizationId: string, key: string) {
    return withOrganization(organizationId, async () => {
      const row = await this.database.client.projectCreation.findFirst({
        where: { idempotencyKey: key },
        select: { id: true, project: { select: { id: true, name: true } } },
      });
      return row ? { ...row.project, creationId: row.id } : null;
    });
  }

  async create(actor: AuditActor, input: NewProject): Promise<CreatedProject> {
    try {
      return await this.createOnce(actor, input);
    } catch (error) {
      // Course entre deux requêtes de même clé : l'unicité a tranché, l'autre transaction a gagné.
      const key = input.idempotencyKey;
      const winner =
        isUniqueViolation(error) && key ? await this.findByKey(actor.organizationId, key) : null;
      if (!winner) throw error;
      return { ...winner, creationId: winner.creationId, queued: false, replayed: true };
    }
  }

  private createOnce(actor: AuditActor, input: NewProject): Promise<CreatedProject> {
    const { organizationId } = actor;
    return withOrganization(organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: { name: input.name, organizationId, euOnly: input.euOnly },
          select: { id: true, name: true },
        });
        await insertPages(tx, organizationId, project.id, input);
        const creation = await tx.projectCreation.create({
          data: {
            organizationId,
            projectId: project.id,
            ...initialState(input.installationId),
            repoName: input.repoName,
            installationId: input.installationId,
            ideaTemplate: input.ideaTemplate,
            idempotencyKey: input.idempotencyKey,
            requestedBy: actor.userId,
          },
          select: { id: true, status: true },
        });
        await linkClient(tx, organizationId, project.id, input);
        await recordAudit(tx, actor, {
          action: "project.create",
          targetKind: "project",
          targetId: project.id,
        });
        return {
          ...project,
          creationId: creation.id,
          queued: creation.status === "pending",
          replayed: false,
        };
      }),
    );
  }

  installation(organizationId: string, installationId: string): Promise<InstallationChoice | null> {
    return withOrganization(organizationId, () =>
      this.database.client.providerInstallation.findFirst({
        where: { id: installationId, status: "active" },
        select: { id: true, ownerLogin: true },
      }),
    );
  }

  async projectName(scope: ProjectScope): Promise<string | null> {
    const project = await withOrganization(scope.organizationId, () =>
      this.database.client.project.findFirst({
        where: { id: scope.projectId },
        select: { name: true },
      }),
    );
    return project?.name ?? null;
  }

  latestCreation(scope: ProjectScope): Promise<LatestCreation | null> {
    return withOrganization(scope.organizationId, () =>
      this.readLatest(this.database.client, scope),
    );
  }

  private async readLatest(tx: Tx, scope: ProjectScope): Promise<LatestCreation | null> {
    const row = await tx.projectCreation.findFirst({
      where: { projectId: scope.projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!row) return null;
    const installation = row.installationId
      ? await tx.providerInstallation.findFirst({
          where: { id: row.installationId },
          select: { ownerLogin: true },
        })
      : null;
    const ideaPages = await tx.ideaPage.count({
      where: { projectId: scope.projectId, deletedAt: null },
    });
    const clients = await tx.projectClientAccess.count({ where: { projectId: scope.projectId } });
    const invitations = await tx.invitationProject.count({ where: { projectId: scope.projectId } });
    return {
      id: row.id,
      installationId: row.installationId,
      record: {
        invitationFailed: await this.hadInvitationFailure(tx, scope),
        status: row.status as ProjectCreationStatus,
        errorCode: row.errorCode as ProjectCreationErrorCode | null,
        retryAfterMs: row.retryAfterMs,
        repoName: row.repoName,
        ownerLogin: installation?.ownerLogin ?? null,
      },
      ideaPages,
      invited: clients + invitations > 0,
    };
  }

  private async hadInvitationFailure(tx: Tx, scope: ProjectScope): Promise<boolean> {
    return (
      (await tx.projectCreation.count({
        where: { projectId: scope.projectId, invitationFailed: true },
      })) > 0
    );
  }

  retry(scope: ProjectScope, request: RetryRequest): Promise<RetryOutcome> {
    return this.transactions.run(scope, async (tx) => {
      // Verrou de ligne sur le projet : deux relances simultanées se suivent, la seconde voit `pending`.
      await tx.project.updateMany({
        where: { id: scope.projectId },
        data: { updatedAt: new Date() },
      });
      const latest = await this.readLatest(tx, scope);
      const status = latest?.record.status;
      if (status === "pending" || status === "running") {
        return { kind: "refused", reason: "creation_running" };
      }
      const carrier = await tx.projectRepo.count({
        where: { projectId: scope.projectId, OR: [{ role: "spec" }, { specPath: { not: null } }] },
      });
      if (status === "succeeded" || carrier > 0) {
        return { kind: "refused", reason: "creation_succeeded" };
      }
      const template = await tx.projectCreation.findFirst({
        where: { projectId: scope.projectId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { ideaTemplate: true },
      });
      const created = await tx.projectCreation.create({
        data: {
          organizationId: scope.organizationId,
          projectId: scope.projectId,
          status: "pending",
          repoName: request.repoName,
          installationId: request.installationId,
          ideaTemplate: template?.ideaTemplate ?? "default",
          requestedBy: scope.userId,
        },
        select: { id: true },
      });
      await recordAudit(tx, scope, {
        action: "project.retry_repo",
        targetKind: "project",
        targetId: scope.projectId,
      });
      return { kind: "created", creationId: created.id };
    });
  }

  async markInvitationFailed(scope: ProjectScope, creationId: string): Promise<void> {
    await withOrganization(scope.organizationId, () =>
      this.database.client.projectCreation.updateMany({
        where: { id: creationId },
        data: { invitationFailed: true },
      }),
    );
  }

  async failEnqueue(scope: ProjectScope, creationId: string): Promise<void> {
    await withOrganization(scope.organizationId, () =>
      this.database.client.projectCreation.updateMany({
        where: { id: creationId, status: "pending" },
        data: { status: "failed", errorCode: "provider_unavailable" },
      }),
    );
  }

  setEuOnly(scope: ProjectScope, euOnly: boolean): Promise<void> {
    return this.transactions.run(scope, async (tx) => {
      await tx.project.updateMany({ where: { id: scope.projectId }, data: { euOnly } });
      await recordAudit(tx, scope, {
        action: "project.eu_only",
        targetKind: "project",
        targetId: scope.projectId,
      });
    });
  }
}
