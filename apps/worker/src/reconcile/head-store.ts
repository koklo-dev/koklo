import {
  type PrismaClient,
  type TenantClient,
  withOrganization,
  withTenantIsolation,
} from "@koklo/db";
import type { Target } from "../webhook/types.ts";

/** Dépôt à spec avec ce que P4 doit réconcilier : sa branche par défaut et ses têtes connues. */
export interface HeadRepo {
  readonly target: Target;
  readonly defaultBranch: string;
  /** Branche -> snapshot pointé. */
  readonly heads: ReadonlyMap<string, string>;
}

export type HeadAuditAction = "head_updated" | "head_removed" | "unreachable";

export interface HeadStore {
  /** Dépôts à spec (rôle `spec` ou `spec_path`), le moins récemment réconcilié d'abord (jamais = d'abord). */
  repos(): Promise<HeadRepo[]>;
  headsOf(repoId: string): Promise<ReadonlyMap<string, string>>;
  markReconciled(repoId: string): Promise<void>;
  /** Audit système de dépôt ; `once` : écrit une seule fois par (dépôt, action). */
  record(target: Target, action: HeadAuditAction, once: boolean): Promise<void>;
}

/** Lectures par le client brut (comme `ReconcileStore`), écritures d'audit sous `withOrganization`. */
export class PrismaHeadStore implements HeadStore {
  private readonly client: TenantClient;

  constructor(private readonly raw: PrismaClient) {
    this.client = withTenantIsolation(raw);
  }

  async repos(): Promise<HeadRepo[]> {
    const rows = await this.raw.projectRepo.findMany({
      where: { OR: [{ role: "spec" }, { specPath: { not: null } }] },
      orderBy: [{ lastReconciledAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      include: {
        installation: true,
        heads: { select: { branch: true, snapshotId: true } },
      },
    });
    return rows.map((repo) => ({
      defaultBranch: repo.defaultBranch,
      heads: new Map(repo.heads.map((head) => [head.branch, head.snapshotId])),
      target: {
        installation: {
          id: repo.installation.id,
          organizationId: repo.installation.organizationId,
          externalId: repo.installation.externalId,
          status: repo.installation.status,
          ownerKind: repo.installation.ownerKind,
          ownerLogin: repo.installation.ownerLogin,
        },
        repo: {
          id: repo.id,
          projectId: repo.projectId,
          name: repo.name,
          ownerLogin: repo.ownerLogin,
          role: repo.role,
          specPath: repo.specPath,
        },
      },
    }));
  }

  async headsOf(repoId: string): Promise<ReadonlyMap<string, string>> {
    const heads = await this.raw.specHead.findMany({
      where: { repoId },
      select: { branch: true, snapshotId: true },
    });
    return new Map(heads.map((head) => [head.branch, head.snapshotId]));
  }

  async markReconciled(repoId: string): Promise<void> {
    await this.raw.projectRepo.update({
      where: { id: repoId },
      data: { lastReconciledAt: new Date() },
    });
  }

  async record(target: Target, action: HeadAuditAction, once: boolean): Promise<void> {
    const fullAction = `repo.reconcile.${action}`;
    const { organizationId } = target.installation;
    await withOrganization(organizationId, () =>
      this.client.$transaction(async (tx) => {
        if (once) {
          const known = await tx.auditLog.findFirst({
            where: { targetKind: "repo", targetId: target.repo.id, action: fullAction },
            select: { id: true },
          });
          if (known) return;
        }
        await tx.auditLog.create({
          data: {
            organizationId,
            actorKind: "system",
            action: fullAction,
            targetKind: "repo",
            targetId: target.repo.id,
          },
        });
      }),
    );
  }
}
