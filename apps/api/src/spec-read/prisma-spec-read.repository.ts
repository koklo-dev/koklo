import type { SpecHeadOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { carrierFilter } from "../repo/prisma-repo.repository.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  FeatureFilter,
  FeatureSource,
  IndexedFeatures,
  Revision,
  SpecReadRepository,
} from "./spec-read.repository.ts";

/** Branche de travail de la spec (cadrage), lue avant la branche par défaut du dépôt. */
const WORKING_BRANCH = "cadrage";

type Snapshot = NonNullable<Awaited<ReturnType<Tx["specSnapshot"]["findFirst"]>>>;

interface Resolved {
  repo: NonNullable<Awaited<ReturnType<typeof carrierRepo>>>;
  branch: string;
  snapshot: Snapshot;
}

/** Échec d'indexation tel que stocké ; un code absent (jamais écrit par le worker) devient `unknown`. */
const failureOf = (snapshot: Snapshot) =>
  ({
    kind: "failed",
    errorCode: snapshot.errorCode ?? "unknown",
    commitSha: snapshot.commitSha,
  }) as const;

const carrierRepo = (tx: Tx, scope: ProjectScope) =>
  tx.projectRepo.findFirst({ where: { projectId: scope.projectId, ...carrierFilter } });

const headOf = (tx: Tx, repoId: string, branch: string) =>
  tx.specHead.findFirst({ where: { repoId, branch }, include: { snapshot: true } });

/**
 * Instantané de la révision et sa branche (`""` quand un `commitSha` n'est pointé par aucune).
 * Un `commitSha` pointé par plusieurs branches rend la première par ordre alphabétique (déterministe).
 * Le statut `building` n'est jamais écrit par le worker (instantané créé directement `ready|failed`) :
 * il est lu comme `ready` et `head` le rend tel que stocké.
 */
async function resolve(tx: Tx, scope: ProjectScope, revision: Revision): Promise<Resolved | null> {
  const repo = await carrierRepo(tx, scope);
  if (!repo) return null;
  if (revision.commitSha !== undefined) {
    const snapshot = await tx.specSnapshot.findFirst({
      where: { repoId: repo.id, commitSha: revision.commitSha },
    });
    if (!snapshot) return null;
    const pointing = await tx.specHead.findFirst({
      where: { repoId: repo.id, snapshotId: snapshot.id },
      orderBy: { branch: "asc" },
    });
    return { repo, snapshot, branch: pointing?.branch ?? "" };
  }
  const branches =
    revision.branch === undefined ? [WORKING_BRANCH, repo.defaultBranch] : [revision.branch];
  for (const branch of branches) {
    const head = await headOf(tx, repo.id, branch);
    if (head) return { repo, snapshot: head.snapshot, branch };
  }
  return null;
}

@Injectable()
export class PrismaSpecReadRepository implements SpecReadRepository {
  constructor(@Inject(ProjectTransactions) private readonly transactions: ProjectTransactions) {}

  head(scope: ProjectScope, revision: Revision): Promise<SpecHeadOutput> {
    return this.transactions.run(scope, async (tx) => {
      const found = await resolve(tx, scope, revision);
      if (!found) return null;
      const where = { snapshotId: found.snapshot.id };
      const [features, tables, endpoints] = await Promise.all([
        tx.specFeature.count({ where }),
        tx.specTable.count({ where }),
        tx.specEndpoint.count({ where }),
      ]);
      return {
        branch: found.branch,
        commitSha: found.snapshot.commitSha,
        status: found.snapshot.status,
        errorCode: found.snapshot.errorCode,
        indexedAt: found.snapshot.indexedAt.toISOString(),
        counts: { features, tables, endpoints },
      };
    });
  }

  features(
    scope: ProjectScope,
    revision: Revision,
    filter: FeatureFilter,
  ): Promise<IndexedFeatures | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await resolve(tx, scope, revision);
      if (!found) return null;
      const { snapshot } = found;
      if (snapshot.status === "failed") {
        return failureOf(snapshot);
      }
      const rows = await tx.specFeature.findMany({
        where: { snapshotId: snapshot.id, ...filter },
        select: {
          specId: true,
          title: true,
          status: true,
          priority: true,
          filePath: true,
          _count: { select: { criteria: true } },
        },
      });
      return {
        kind: "rows",
        rows: rows.map(({ _count, ...row }) => ({ ...row, criteriaCount: _count.criteria })),
      };
    });
  }

  featureSource(scope: ProjectScope, specId: string): Promise<FeatureSource | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await resolve(tx, scope, {});
      if (!found) return null;
      const { repo, snapshot } = found;
      if (snapshot.status === "failed") {
        return failureOf(snapshot);
      }
      const feature = await tx.specFeature.findFirst({
        where: { snapshotId: snapshot.id, specId },
        select: { filePath: true },
      });
      const installation = await tx.providerInstallation.findFirst({
        where: { id: repo.installationId },
      });
      if (!feature || !installation) return null;
      return {
        kind: "found",
        commitSha: snapshot.commitSha,
        filePath: feature.filePath,
        specPath: repo.specPath,
        repoName: repo.name,
        owner: { kind: installation.ownerKind, login: repo.ownerLogin },
        installation: {
          id: installation.id,
          externalId: installation.externalId,
          active: installation.status === "active",
        },
      };
    });
  }
}
