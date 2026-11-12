import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { readPhaseFacts } from "../project/prisma-project-shell.repository.ts";
import { phaseOf } from "../project/project-shell.ts";
import { featureHashesOf } from "../review/entity-hashes.ts";
import { VERDICT_SELECT, verdictOf } from "../review/verdicts.ts";
import { type Snapshot, SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type {
  ClientProjectRecord,
  ClientSpaceRepository,
  FeatureTrail,
  IndexedHead,
} from "./client-space.repository.ts";

/** Lecture seule : aucune méthode n'écrit (ni reviews, ni suggestions, ni audit) ; la phase réconcilie seulement les versions de l'idée, comme `project.shell`. */
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
    return withOrganization(organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        const rows = await tx.project.findMany({
          where: linkedIds === null ? {} : { id: { in: [...linkedIds] } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, name: true },
        });
        const projects: ClientProjectRecord[] = [];
        for (const { id, name } of rows) {
          // Même calcul que `project.shell` et `project.overview` (B272) ; le contrat du client garde `framing` / `iteration`.
          const facts = await readPhaseFacts(tx, this.resolver, {
            organizationId,
            projectId: id,
            userId: "",
          });
          projects.push({
            id,
            name,
            phase: phaseOf(facts) === "iterations" ? "iteration" : "framing",
          });
        }
        return projects;
      }),
    );
  }

  /** Instantané de la tête courante, `null` si rien n'est indexé ou si l'indexation a échoué. */
  private async readySnapshot(tx: Tx, scope: ProjectScope): Promise<Snapshot | null> {
    const found = await this.resolver.resolve(tx, scope, {});
    return found && found.snapshot.status !== "failed" ? found.snapshot : null;
  }

  indexedHead(scope: ProjectScope): Promise<IndexedHead | null> {
    return this.transactions.run(scope, async (tx) => {
      const snapshot = await this.readySnapshot(tx, scope);
      if (!snapshot) return null;
      const features = await tx.specFeature.findMany({
        where: { snapshotId: snapshot.id },
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
      return { sha: snapshot.commitSha, rows };
    });
  }

  featureHead(scope: ProjectScope, specId: string): Promise<{ found: boolean } | null> {
    return this.transactions.run(scope, async (tx) => {
      const snapshot = await this.readySnapshot(tx, scope);
      if (!snapshot) return null;
      const feature = await tx.specFeature.findFirst({
        where: { snapshotId: snapshot.id, specId },
        select: { id: true },
      });
      return { found: feature !== null };
    });
  }

  trails(scope: ProjectScope, refs: readonly string[]): Promise<Map<string, FeatureTrail>> {
    return this.transactions.run(scope, async (tx) => {
      const targetRef = { in: [...refs] };
      const snapshot = await this.readySnapshot(tx, scope);
      const hashes = snapshot
        ? (await featureHashesOf(tx, [snapshot.id])).get(snapshot.id)
        : undefined;
      const [reviews, suggestions] = await Promise.all([
        tx.review.findMany({
          where: { projectId: scope.projectId, targetKind: "feature", targetRef },
          select: VERDICT_SELECT,
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
            latestReview: verdictOf(
              reviews.filter((review) => review.targetRef === ref),
              hashes?.get(ref) ?? null,
            ),
            openSuggestions: suggestions.filter((row) => row.targetRef === ref).length,
          },
        ]),
      );
    });
  }
}
