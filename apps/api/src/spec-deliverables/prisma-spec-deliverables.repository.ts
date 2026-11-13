import { type DeliverableKey, ideaPagesDiff } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { readPhaseFacts } from "../project/prisma-project-shell.repository.ts";
import { SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import { recordAudit } from "../tracker/audit.ts";
import { ProjectTransactions, type Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaImpact } from "./deliverable-impact.ts";
import { readUpstreamFacts } from "./prisma-deliverable-upstream.ts";
import type {
  DeliverableRecord,
  ForceResult,
  SpecDeliverablesRepository,
} from "./spec-deliverables.repository.ts";

/** Sept livrables au plus : toutes les lectures sont bornées. */
const MAX_DELIVERABLES = 7;

async function pendingByDeliverable(
  tx: Tx,
  projectId: string,
): Promise<DeliverableRecord["pendingByDeliverable"]> {
  // Au plus sept groupes (CHECK sur la clé) : bornée sans `take`, que l'extension multi-tenant trie par `id`.
  const groups = await tx.agentProposal.groupBy({
    by: ["deliverable"],
    where: { projectId, status: "pending" },
    _count: { _all: true },
  });
  return Object.fromEntries(groups.map((group) => [group.deliverable, group._count._all]));
}

const ELEMENT_KINDS = ["feature", "flow", "rules", "roles"] as const;

const pagesOf = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(typeof value === "object" && value !== null ? value : {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );

/** Dernière décision de chaque livrable : la cible `deliverable` et, pour le Fonctionnel, ses éléments et blocs. */
async function lastReviewAt(tx: Tx, projectId: string): Promise<IdeaImpact["lastReviewAt"]> {
  // Au plus sept groupes (une cible par livrable) : bornée sans `take`.
  const groups = await tx.review.groupBy({
    by: ["targetRef"],
    where: { projectId, targetKind: "deliverable" },
    _max: { createdAt: true },
  });
  const last: IdeaImpact["lastReviewAt"] = {};
  for (const group of groups) {
    if (group._max.createdAt) last[group.targetRef as DeliverableKey] = group._max.createdAt;
  }
  const element = await tx.review.findFirst({
    where: { projectId, targetKind: { in: [...ELEMENT_KINDS] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (element && (!last.functional || element.createdAt > last.functional)) {
    last.functional = element.createdAt;
  }
  return last;
}

/** Les deux dernières versions d'idée figées, comparées page par page ; `null` si une seule ou aucune page n'a changé. */
async function ideaImpact(tx: Tx, projectId: string): Promise<IdeaImpact | null> {
  const [latest, previous] = await tx.ideaVersion.findMany({
    where: { projectId, commitSha: { not: null } },
    orderBy: { number: "desc" },
    take: 2,
    select: { tag: true, pagesVersions: true, frozenAt: true },
  });
  if (!latest || !previous) return null;
  const { changedPages } = ideaPagesDiff(
    pagesOf(previous.pagesVersions),
    pagesOf(latest.pagesVersions),
  );
  if (changedPages === 0) return null;
  return {
    idea: latest.tag,
    frozenAt: latest.frozenAt,
    changedPages,
    lastReviewAt: await lastReviewAt(tx, projectId),
  };
}

@Injectable()
export class PrismaSpecDeliverablesRepository implements SpecDeliverablesRepository {
  constructor(
    @Inject(ProjectTransactions) private readonly transactions: ProjectTransactions,
    @Inject(SpecHeadResolver) private readonly resolver: SpecHeadResolver,
  ) {}

  read(scope: ProjectScope, { withPending }: { withPending: boolean }): Promise<DeliverableRecord> {
    return this.transactions.run(scope, async (tx) => {
      const facts = await readPhaseFacts(tx, this.resolver, scope);
      const overrides = await tx.deliverableOverride.findMany({
        where: { projectId: scope.projectId },
        select: { deliverable: true },
        take: MAX_DELIVERABLES,
      });
      return {
        ideaFrozen: facts.ideaVersions > 0,
        featureCount: facts.featureCount,
        impact: await ideaImpact(tx, scope.projectId),
        upstream: await readUpstreamFacts(tx, this.resolver, scope),
        forced: overrides.map((row) => row.deliverable as DeliverableKey),
        pendingByDeliverable: withPending ? await pendingByDeliverable(tx, scope.projectId) : {},
      };
    });
  }

  force(scope: ProjectScope, key: DeliverableKey): Promise<ForceResult> {
    return this.transactions.run(scope, async (tx) => {
      const { count } = await tx.deliverableOverride.createMany({
        data: [
          {
            organizationId: scope.organizationId,
            projectId: scope.projectId,
            deliverable: key,
            forcedBy: scope.userId,
          },
        ],
        skipDuplicates: true,
      });
      const row = await tx.deliverableOverride.findFirstOrThrow({
        where: { projectId: scope.projectId, deliverable: key },
        select: { id: true },
      });
      if (count > 0) {
        await recordAudit(tx, scope, {
          action: "deliverable.force",
          targetKind: "deliverable_override",
          targetId: row.id,
        });
      }
      return { id: row.id, created: count > 0 };
    });
  }
}
