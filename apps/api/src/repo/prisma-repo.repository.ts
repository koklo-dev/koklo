import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { isUniqueViolation, notFound, orNotFound } from "../tracker/api-errors.ts";
import { recordAudit } from "../tracker/audit.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  InsertOutcome,
  NewRepo,
  RepoAction,
  RepoConflict,
  RepoPlan,
  RepoRecord,
  RepoRepository,
} from "./repo.repository.ts";

const isSpecCarrier = (repo: Pick<NewRepo, "role" | "specPath">) =>
  repo.role === "spec" || repo.specPath !== null;

/** Le repo porte la spec : rôle `spec`, ou dossier `spec_path` d'un monorepo (index unique partiel). */
export const carrierFilter = { OR: [{ role: "spec" as const }, { specPath: { not: null } }] };

async function conflictOf(
  tx: Tx,
  scope: ProjectScope,
  repo: NewRepo,
): Promise<RepoConflict | null> {
  if (isSpecCarrier(repo)) {
    const carrier = await tx.projectRepo.findFirst({
      where: { projectId: scope.projectId, ...carrierFilter },
      select: { id: true },
    });
    if (carrier) return "spec_repo_exists";
  }
  const linked = await tx.projectRepo.findFirst({
    where: { installationId: repo.installationId, externalId: repo.externalId },
    select: { id: true },
  });
  return linked ? "repo_already_linked" : null;
}

const recordOf = (row: {
  id: string;
  projectId: string;
  installationId: string;
  role: RepoRecord["role"];
  mode: RepoRecord["mode"];
  ownerLogin: string;
  name: string;
  defaultBranch: string;
  specPath: string | null;
}): RepoRecord => ({
  id: row.id,
  projectId: row.projectId,
  installationId: row.installationId,
  role: row.role,
  mode: row.mode,
  ownerLogin: row.ownerLogin,
  name: row.name,
  defaultBranch: row.defaultBranch,
  specPath: row.specPath,
});

@Injectable()
export class PrismaRepoRepository implements RepoRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  plan(scope: ProjectScope, installationId: string): Promise<RepoPlan> {
    return this.transactions.run(scope, async (tx) => {
      const project = orNotFound(
        await tx.project.findFirst({ where: { id: scope.projectId }, select: { name: true } }),
      );
      const installation = await tx.providerInstallation.findFirst({
        where: { id: installationId, status: "active" },
      });
      if (!installation) throw notFound();
      const organization = orNotFound(
        await this.database.raw.organization.findUnique({
          where: { id: scope.organizationId },
          select: { slug: true },
        }),
      );
      const carrier = await tx.projectRepo.findFirst({
        where: { projectId: scope.projectId, ...carrierFilter },
        select: { id: true },
      });
      return {
        projectName: project.name,
        organizationSlug: organization.slug,
        installation: {
          id: installation.id,
          externalId: installation.externalId,
          ownerKind: installation.ownerKind,
          ownerLogin: installation.ownerLogin,
        },
        hasSpecCarrier: carrier !== null,
      };
    });
  }

  async insert(scope: ProjectScope, repo: NewRepo, action: RepoAction): Promise<InsertOutcome> {
    try {
      return await this.transactions.run(scope, async (tx) => {
        const conflict = await conflictOf(tx, scope, repo);
        if (conflict) return { conflict };
        const row = await tx.projectRepo.create({
          data: { organizationId: scope.organizationId, projectId: scope.projectId, ...repo },
        });
        await recordAudit(tx, scope, { action, targetKind: "repo", targetId: row.id });
        return { repo: recordOf(row) };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Course entre deux requêtes : l'index unique a tranché, la transaction est annulée.
      const conflict = await this.transactions.run(scope, (tx) => conflictOf(tx, scope, repo));
      return { conflict: conflict ?? "repo_already_linked" };
    }
  }

  list(scope: ProjectScope): Promise<RepoRecord[]> {
    return this.transactions.run(scope, async (tx) => {
      const rows = await tx.projectRepo.findMany({
        where: { projectId: scope.projectId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return rows.map(recordOf);
    });
  }
}
