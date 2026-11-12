import type { ReviewVerdict } from "../client-space/validation.ts";
import { featureHashesOf } from "../review/entity-hashes.ts";
import { groupByTarget, VERDICT_SELECT, verdictOf } from "../review/verdicts.ts";
import type { Resolved, SpecHeadResolver } from "../spec-read/spec-head-resolver.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { MemberFact } from "./overview-main.ts";
import type { OverviewRecord } from "./project-overview.repository.ts";

const WEEK_MS = 7 * 24 * 3_600_000;
const CLIENT_ROLES = ["client", "business"];
const TEAM_ROLES = ["owner", "admin", "dev", "designer"];

const nameOf = (row: { role: string; user: { name: string } }): MemberFact => ({
  name: row.user.name,
  role: row.role,
});

/** Personnes liées au projet : les clients par lien d'accès, l'équipe de l'organisation par rôle. */
export async function readPeople(tx: Tx, scope: ProjectScope) {
  const links = await tx.projectClientAccess.findMany({
    where: { projectId: scope.projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { userId: true, member: { select: { role: true, user: { select: { name: true } } } } },
  });
  const staff = await tx.member.findMany({
    where: { organizationId: scope.organizationId, role: { in: TEAM_ROLES } },
    select: { role: true, user: { select: { name: true } } },
  });
  return {
    clients: links.map((link) => nameOf(link.member)),
    clientIds: links.map((link) => link.userId),
    staff: staff.map(nameOf),
  };
}

type IdeaRead = Pick<
  OverviewRecord,
  "pages" | "pendingProposals" | "proposalAuthor" | "clientMessages" | "ideaVersion"
>;

/** Dossier d'idée : pages, propositions en attente, échanges du client cette semaine, dernière version commitée. */
export async function readIdea(
  tx: Tx,
  scope: ProjectScope,
  clientIds: readonly string[],
  now: Date,
): Promise<IdeaRead> {
  const projectId = scope.projectId;
  const pages = await tx.ideaPage.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { position: "asc" },
    select: {
      id: true,
      position: true,
      title: true,
      status: true,
      required: true,
      updatedAt: true,
    },
  });
  const proposals = await tx.ideaProposal.groupBy({
    by: ["pageId"],
    where: { projectId, status: "pending" },
    _count: { _all: true },
  });
  const perPage = new Map(proposals.map((group) => [group.pageId, group._count._all]));
  const pendingProposals = proposals.reduce((sum, group) => sum + group._count._all, 0);
  const version = await tx.ideaVersion.findFirst({
    where: { projectId, commitSha: { not: null } },
    orderBy: { number: "desc" },
    select: { number: true, tag: true, frozenAt: true },
  });
  return {
    pages: pages.map(({ id, ...page }) => ({ ...page, pendingProposals: perPage.get(id) ?? 0 })),
    pendingProposals,
    proposalAuthor: pendingProposals > 0 ? await lastHumanAuthor(tx, scope) : null,
    clientMessages:
      clientIds.length === 0
        ? null
        : await tx.ideaMessage.count({
            where: {
              projectId,
              author: "human",
              authorUserId: { in: [...clientIds] },
              createdAt: { gte: new Date(now.getTime() - WEEK_MS) },
            },
          }),
    ideaVersion: version,
  };
}

async function lastHumanAuthor(tx: Tx, scope: ProjectScope): Promise<string | null> {
  const message = await tx.ideaMessage.findFirst({
    where: { projectId: scope.projectId, author: "human", authorUserId: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { authorUserId: true },
  });
  if (!message?.authorUserId) return null;
  const member = await tx.member.findFirst({
    where: { organizationId: scope.organizationId, userId: message.authorUserId },
    select: { user: { select: { name: true } } },
  });
  return member?.user.name ?? null;
}

type SpecRead = Pick<OverviewRecord, "spec" | "suggestions"> & { snapshotId: string | null };

/** Spec : état de l'index, dernière review de chaque fonctionnalité de la tête, suggestions ouvertes du client. */
export async function readSpec(
  tx: Tx,
  resolver: SpecHeadResolver,
  scope: ProjectScope,
): Promise<SpecRead> {
  const found = await resolver.resolve(tx, scope, {});
  const failed = found?.snapshot.status === "failed";
  const suggestions = await readSuggestions(tx, scope);
  if (!found || failed) {
    return { snapshotId: null, spec: { failed, head: null, verdicts: [] }, suggestions };
  }
  return {
    snapshotId: found.snapshot.id,
    spec: {
      failed,
      head: await headOf(tx, found),
      verdicts: await verdictsOf(tx, scope, found.snapshot.id),
    },
    suggestions,
  };
}

async function headOf(tx: Tx, { repo, snapshot }: Resolved) {
  return {
    sha: snapshot.commitSha,
    indexedAt: snapshot.indexedAt,
    versions: await tx.specSnapshot.count({ where: { repoId: repo.id } }),
  };
}

export async function verdictsOf(
  tx: Tx,
  scope: ProjectScope,
  snapshotId: string,
): Promise<(ReviewVerdict | undefined)[]> {
  const features = await tx.specFeature.findMany({
    where: { snapshotId },
    select: { specId: true },
  });
  const reviews = await tx.review.findMany({
    where: {
      projectId: scope.projectId,
      targetKind: "feature",
      targetRef: { in: features.map((feature) => feature.specId) },
    },
    select: VERDICT_SELECT,
  });
  const byFeature = groupByTarget(reviews);
  const hashes = (await featureHashesOf(tx, [snapshotId])).get(snapshotId);
  return features.map((feature) =>
    verdictOf(
      byFeature.get(`feature:${feature.specId}`) ?? [],
      hashes?.get(feature.specId) ?? null,
    ),
  );
}

async function readSuggestions(
  tx: Tx,
  scope: ProjectScope,
): Promise<OverviewRecord["suggestions"]> {
  const where = {
    projectId: scope.projectId,
    status: "open" as const,
    authorRole: { in: CLIENT_ROLES },
    targetKind: { not: "screen" as const },
  };
  const first = await tx.suggestion.findFirst({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { key: true, body: true },
  });
  return { open: await tx.suggestion.count({ where }), first };
}

/** Sprint actif et ses tickets (bornés par le sprint, jamais par le projet entier). */
export async function readSprint(tx: Tx, scope: ProjectScope): Promise<OverviewRecord["sprint"]> {
  const sprint = await tx.sprint.findFirst({
    where: { projectId: scope.projectId, status: "active" },
    select: { id: true, key: true, goal: true },
  });
  if (!sprint) return null;
  const tickets = await tx.ticket.findMany({
    where: { projectId: scope.projectId, sprintId: sprint.id, deletedAt: null },
    select: { key: true, title: true, status: true, updatedAt: true },
  });
  return { key: sprint.key, goal: sprint.goal, tickets };
}

/** Date de la baseline posée : sa validation, à défaut son tag. */
export async function readBaselineDate(tx: Tx, scope: ProjectScope): Promise<Date | null> {
  const baseline = await tx.baseline.findFirst({
    where: { projectId: scope.projectId, status: { in: ["validated", "tagged"] } },
    orderBy: { number: "asc" },
    select: { validatedAt: true, taggedAt: true },
  });
  return baseline ? (baseline.validatedAt ?? baseline.taggedAt) : null;
}

/** Une clé d'IA valide existe : la même source que `idea.agent.status` (fournisseurs disponibles). */
export async function readAiConfigured(tx: Tx): Promise<boolean> {
  return (await tx.llmProviderCredential.count({ where: { invalidatedAt: null } })) > 0;
}
