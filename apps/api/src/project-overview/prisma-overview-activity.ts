import { keysetAfter, pageOfItems, positionOf } from "../tracker/cursor.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  ACTIVITY_ACTIONS,
  type ActivityRow,
  activityActionsFilter,
  CLIENT_ACTIVITY_ACTIONS,
} from "./overview-activity.ts";
import type { ActivityPage, Audience } from "./project-overview.repository.ts";

type AuditRow = Awaited<ReturnType<Tx["auditLog"]["findMany"]>>[number];

/**
 * Journal lisible du projet. Les événements du projet portent `project_id` ; `project.create` est une écriture
 * d'organisation (sans projet), retrouvée par sa cible. Jamais `system`, jamais un événement hors liste fermée.
 */
function whereOf(scope: ProjectScope, audience: Audience) {
  const actions = audience === "client" ? CLIENT_ACTIVITY_ACTIONS : ACTIVITY_ACTIONS;
  return {
    actorKind: { not: "system" as const },
    AND: [
      activityActionsFilter(actions),
      {
        OR: [
          { projectId: scope.projectId },
          { action: "project.create", targetKind: "project", targetId: scope.projectId },
        ],
      },
    ],
  };
}

const isReviewVerdict = (action: string) =>
  action.startsWith("review.") && action !== "review.remind";

const idsOf = (rows: AuditRow[], match: (action: string) => boolean): string[] => [
  ...new Set(rows.filter((row) => match(row.action)).map((row) => row.targetId)),
];

const reviewLabel = (
  review: { targetKind: string; targetRef: string },
  titles: Map<string, string>,
): string => {
  if (review.targetKind === "baseline") return "la baseline";
  if (review.targetKind !== "feature") return "un écran";
  const title = titles.get(review.targetRef);
  return title ? `${review.targetRef} ${title}` : review.targetRef;
};

/** Relance du client (B352) : la cible de l'audit est le lien d'accès, le libellé le prénom du client. */
async function clientLabels(
  tx: Tx,
  scope: ProjectScope,
  rows: AuditRow[],
  labels: Map<string, string>,
): Promise<void> {
  const links = await tx.projectClientAccess.findMany({
    where: { projectId: scope.projectId, id: { in: idsOf(rows, (a) => a === "review.remind") } },
    select: { id: true, member: { select: { user: { select: { name: true } } } } },
  });
  for (const link of links) {
    const first = link.member.user.name.trim().split(/\s+/)[0];
    if (first) labels.set(link.id, first);
  }
}

/** Commentaire de table (B454) : la cible de l'audit est le commentaire, le libellé l'identifiant `T-slug` de la table. */
async function tableCommentLabels(
  tx: Tx,
  rows: AuditRow[],
  labels: Map<string, string>,
): Promise<void> {
  const ids = idsOf(rows, (action) => action === "comment.create");
  if (ids.length === 0) return;
  const comments = await tx.ticketComment.findMany({
    where: { id: { in: ids }, targetKind: "table" },
    select: { id: true, targetRef: true },
  });
  for (const comment of comments) if (comment.targetRef) labels.set(comment.id, comment.targetRef);
}

/** Libellés des cibles citées : une requête par famille de cible, jamais une par ligne. */
async function targetLabels(
  tx: Tx,
  scope: ProjectScope,
  rows: AuditRow[],
  headSnapshot: string | null,
) {
  const labels = new Map<string, string>();
  const reviews = await tx.review.findMany({
    where: { id: { in: idsOf(rows, isReviewVerdict) } },
    select: { id: true, targetKind: true, targetRef: true },
  });
  const features = headSnapshot
    ? await tx.specFeature.findMany({
        where: { snapshotId: headSnapshot, specId: { in: reviews.map((r) => r.targetRef) } },
        select: { specId: true, title: true },
      })
    : [];
  const titles = new Map(features.map((feature) => [feature.specId, feature.title]));
  for (const review of reviews) labels.set(review.id, reviewLabel(review, titles));
  const suggestions = await tx.suggestion.findMany({
    where: {
      projectId: scope.projectId,
      id: { in: idsOf(rows, (a) => a === "suggestion.create") },
    },
    select: { id: true, key: true },
  });
  const sprints = await tx.sprint.findMany({
    where: { projectId: scope.projectId, id: { in: idsOf(rows, (a) => a.startsWith("sprint.")) } },
    select: { id: true, key: true },
  });
  for (const row of [...suggestions, ...sprints]) labels.set(row.id, row.key);
  await clientLabels(tx, scope, rows, labels);
  await tableCommentLabels(tx, rows, labels);
  return labels;
}

async function actorsOf(tx: Tx, scope: ProjectScope, rows: AuditRow[]) {
  const ids = [
    ...new Set(
      rows.flatMap((row) => (row.actorKind === "human" && row.actorId ? [row.actorId] : [])),
    ),
  ];
  const members = await tx.member.findMany({
    where: { organizationId: scope.organizationId, userId: { in: ids } },
    select: { userId: true, role: true, user: { select: { name: true } } },
  });
  return new Map(members.map((member) => [member.userId, member]));
}

/** `headSnapshot` : instantané de la tête de spec, pour nommer les fonctionnalités d'un verdict. */
export async function readActivity(
  tx: Tx,
  scope: ProjectScope,
  audience: Audience,
  page: { cursor: string | undefined; limit: number },
  headSnapshot: string | null,
): Promise<ActivityPage> {
  const where = whereOf(scope, audience);
  const position = positionOf(page.cursor);
  const scoped = position ? { AND: [where, keysetAfter("occurredAt", position, "desc")] } : where;
  const total = await tx.auditLog.count({ where });
  const after = position ? await tx.auditLog.count({ where: scoped }) : 0;
  const rows = await tx.auditLog.findMany({
    where: scoped,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: page.limit + 1,
  });
  const visible = rows.slice(0, page.limit);
  const labels = await targetLabels(tx, scope, visible, headSnapshot);
  const actors = await actorsOf(tx, scope, visible);
  const { items, nextCursor } = pageOfItems(
    rows,
    page.limit,
    (row) => row.occurredAt,
    (row): ActivityRow => {
      const actor = row.actorId ? actors.get(row.actorId) : undefined;
      return {
        action: row.action,
        occurredAt: row.occurredAt,
        actorKind: row.actorKind,
        actorName: actor?.user.name ?? null,
        actorRole: actor?.role ?? null,
        target: labels.get(row.targetId) ?? null,
      };
    },
  );
  return { rows: items, total, offset: position ? total - after : 0, nextCursor };
}
