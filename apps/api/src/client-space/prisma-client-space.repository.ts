import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { ProjectTransactions } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  ClientProjectRecord,
  ClientSpaceRepository,
  FeatureTrail,
  IndexedHead,
} from "./client-space.repository.ts";
import { latestReview } from "./validation.ts";

/** Lecture seule : aucune méthode n'écrit (ni reviews, ni suggestions, ni audit). */
@Injectable()
export class PrismaClientSpaceRepository implements ClientSpaceRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
  ) {}

  async projects(
    organizationId: string,
    linkedIds: readonly string[] | null,
  ): Promise<ClientProjectRecord[]> {
    const rows = await withOrganization(organizationId, () =>
      this.database.client.project.findMany({
        where: linkedIds === null ? {} : { id: { in: [...linkedIds] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          baselines: { where: { status: "tagged" }, select: { id: true }, take: 1 },
        },
      }),
    );
    return rows.map(({ id, name, baselines }) => ({
      id,
      name,
      phase: baselines.length > 0 ? "iteration" : "framing",
    }));
  }

  indexedHead(scope: ProjectScope): Promise<IndexedHead | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, {});
      if (!found || found.snapshot.status === "failed") return null;
      const features = await tx.specFeature.findMany({
        where: { snapshotId: found.snapshot.id },
        select: {
          specId: true,
          title: true,
          priority: true,
          _count: { select: { criteria: true } },
        },
      });
      const rows = features.map(({ _count, ...row }) => ({
        ...row,
        criteriaCount: _count.criteria,
      }));
      return { sha: found.snapshot.commitSha, rows };
    });
  }

  featureHead(scope: ProjectScope, specId: string): Promise<{ found: boolean } | null> {
    return this.transactions.run(scope, async (tx) => {
      const found = await this.resolver.resolve(tx, scope, {});
      if (!found || found.snapshot.status === "failed") return null;
      const feature = await tx.specFeature.findFirst({
        where: { snapshotId: found.snapshot.id, specId },
        select: { id: true },
      });
      return { found: feature !== null };
    });
  }

  trails(scope: ProjectScope, refs: readonly string[]): Promise<Map<string, FeatureTrail>> {
    return this.transactions.run(scope, async (tx) => {
      const targetRef = { in: [...refs] };
      const [reviews, suggestions] = await Promise.all([
        tx.review.findMany({
          where: { projectId: scope.projectId, targetKind: "feature", targetRef },
          select: { id: true, targetRef: true, status: true, sha: true, createdAt: true },
        }),
        tx.suggestion.findMany({
          where: { projectId: scope.projectId, targetKind: "feature", status: "open", targetRef },
          select: { targetRef: true },
        }),
      ]);
      return new Map(
        refs.map((ref) => [
          ref,
          {
            latestReview: latestReview(reviews.filter((review) => review.targetRef === ref)),
            openSuggestions: suggestions.filter((row) => row.targetRef === ref).length,
          },
        ]),
      );
    });
  }
}
