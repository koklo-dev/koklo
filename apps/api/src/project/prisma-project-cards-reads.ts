import type { ReviewVerdict } from "../client-space/validation.ts";
import {
  ACTIVITY_ACTIONS,
  activityActionsFilter,
  CLIENT_ACTIVITY_ACTIONS,
} from "../project-overview/overview-activity.ts";
import {
  type MemberFact,
  type TicketFact,
  teamInOrder,
} from "../project-overview/overview-main.ts";
import { carrierFilter } from "../repo/prisma-repo.repository.ts";
import { featureHashesOf } from "../review/entity-hashes.ts";
import { VERDICT_SELECT, verdictOf } from "../review/verdicts.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { Audience, CardFacts } from "./project-cards.ts";

/**
 * Lectures groupées de la liste en cartes (TK-93, B299) : une requête par famille de faits, sur tous
 * les projets à la fois. Aucune fonction ici ne boucle sur les projets pour interroger la base.
 */
type Ids = readonly string[];
const group = <T extends { projectId: string }>(rows: readonly T[]): Map<string, T[]> => {
  const byProject = new Map<string, T[]>();
  for (const row of rows)
    byProject.set(row.projectId, [...(byProject.get(row.projectId) ?? []), row]);
  return byProject;
};

const TEAM_ROLES = ["owner", "admin", "dev", "designer"];
const WORKING_BRANCH = "cadrage";

export async function readStaff(tx: Tx): Promise<MemberFact[]> {
  const rows = await tx.member.findMany({
    where: { role: { in: TEAM_ROLES } },
    select: { role: true, user: { select: { name: true } } },
  });
  return teamInOrder(rows.map((row) => ({ name: row.user.name, role: row.role })));
}

/** Clients liés, par projet, dans l'ordre des liens. */
export async function readClients(tx: Tx, ids: Ids): Promise<Map<string, MemberFact[]>> {
  const links = await tx.projectClientAccess.findMany({
    where: { projectId: { in: [...ids] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      projectId: true,
      member: { select: { role: true, user: { select: { name: true } } } },
    },
  });
  const byProject = group(links);
  return new Map(
    [...byProject].map(([projectId, rows]) => [
      projectId,
      rows.map((row) => ({ name: row.member.user.name, role: row.member.role })),
    ]),
  );
}

export interface IdeaFacts {
  pages: Map<string, CardFacts["pages"]>;
  proposals: Map<string, { count: number; author: string | null }>;
  versions: Map<string, number>;
}

export async function readIdea(tx: Tx, ids: Ids): Promise<IdeaFacts> {
  const projectIds = [...ids];
  const pages = await tx.ideaPage.findMany({
    where: { projectId: { in: projectIds }, deletedAt: null },
    orderBy: { position: "asc" },
    select: { projectId: true, title: true, status: true, required: true },
  });
  const pending = await tx.ideaProposal.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, status: "pending" },
    _count: { _all: true },
  });
  const versions = await tx.ideaVersion.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projectIds }, commitSha: { not: null } },
    _count: { _all: true },
  });
  const authors = await readProposalAuthors(
    tx,
    pending.map((row) => row.projectId),
  );
  return {
    pages: new Map([...group(pages)].map(([id, rows]) => [id, rows])),
    proposals: new Map(
      pending.map((row) => [
        row.projectId,
        { count: row._count._all, author: authors.get(row.projectId) ?? null },
      ]),
    ),
    versions: new Map(versions.map((row) => [row.projectId, row._count._all])),
  };
}

/** Auteur du dernier message humain du fil de l'Idée, nommé par la règle des propositions (une requête). */
async function readProposalAuthors(tx: Tx, ids: Ids): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const messages = await tx.ideaMessage.findMany({
    where: { projectId: { in: [...ids] }, author: "human", authorUserId: { not: null } },
    orderBy: [{ projectId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    distinct: ["projectId"],
    select: { projectId: true, authorUserId: true },
  });
  const names = await memberNames(
    tx,
    messages.flatMap((message) => message.authorUserId ?? []),
  );
  return new Map(
    messages.flatMap((message) => {
      const name = message.authorUserId ? names.get(message.authorUserId) : undefined;
      return name === undefined ? [] : [[message.projectId, name] as const];
    }),
  );
}

async function memberNames(tx: Tx, userIds: Ids): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const members = await tx.member.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
    select: { userId: true, user: { select: { name: true } } },
  });
  return new Map(members.map((member) => [member.userId, member.user.name]));
}

export async function readBaselines(tx: Tx, ids: Ids): Promise<Map<string, number>> {
  const rows = await tx.baseline.groupBy({
    by: ["projectId"],
    where: { projectId: { in: [...ids] }, status: { in: ["validated", "tagged"] } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.projectId, row._count._all]));
}

export interface SpecFacts {
  featureCount: number;
  failed: boolean;
  head: { sha: string; indexedAt: Date } | null;
  verdicts: (ReviewVerdict | undefined)[];
}

/** Tête de spec de chaque projet : dépôt porteur, branche de cadrage puis branche par défaut, fonctionnalités et dernier verdict. */
export async function readSpec(tx: Tx, ids: Ids): Promise<Map<string, SpecFacts>> {
  const repos = await tx.projectRepo.findMany({
    where: { projectId: { in: [...ids] }, ...carrierFilter },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, projectId: true, defaultBranch: true },
  });
  const carrier = new Map<string, (typeof repos)[number]>();
  for (const repo of repos) if (!carrier.has(repo.projectId)) carrier.set(repo.projectId, repo);
  const heads = await tx.specHead.findMany({
    where: { repoId: { in: [...carrier.values()].map((repo) => repo.id) } },
    select: {
      repoId: true,
      branch: true,
      snapshot: { select: { id: true, status: true, commitSha: true, indexedAt: true } },
    },
  });
  const snapshotOf = new Map<string, (typeof heads)[number]["snapshot"]>();
  for (const [projectId, repo] of carrier) {
    const own = heads.filter((head) => head.repoId === repo.id);
    const found =
      own.find((head) => head.branch === WORKING_BRANCH) ??
      own.find((head) => head.branch === repo.defaultBranch);
    if (found) snapshotOf.set(projectId, found.snapshot);
  }
  return specFacts(tx, snapshotOf);
}

async function specFacts(
  tx: Tx,
  snapshotOf: Map<string, { id: string; status: string; commitSha: string; indexedAt: Date }>,
): Promise<Map<string, SpecFacts>> {
  const snapshotIds = [...snapshotOf.values()].map((snapshot) => snapshot.id);
  const features = await tx.specFeature.findMany({
    where: { snapshotId: { in: snapshotIds } },
    select: { snapshotId: true, specId: true },
  });
  const reviews = await tx.review.findMany({
    where: { projectId: { in: [...snapshotOf.keys()] }, targetKind: "feature" },
    select: { ...VERDICT_SELECT, projectId: true },
  });
  const hashes = await featureHashesOf(tx, snapshotIds);
  const featuresOf = new Map<string, string[]>();
  for (const feature of features) {
    featuresOf.set(feature.snapshotId, [
      ...(featuresOf.get(feature.snapshotId) ?? []),
      feature.specId,
    ]);
  }
  return new Map(
    [...snapshotOf].map(([projectId, snapshot]) => {
      const specIds = featuresOf.get(snapshot.id) ?? [];
      const failed = snapshot.status === "failed";
      const own = reviews.filter((review) => review.projectId === projectId);
      return [
        projectId,
        {
          featureCount: specIds.length,
          failed,
          head: failed ? null : { sha: snapshot.commitSha, indexedAt: snapshot.indexedAt },
          verdicts: failed
            ? []
            : specIds.map((specId) =>
                verdictOf(
                  own.filter((review) => review.targetRef === specId),
                  hashes.get(snapshot.id)?.get(specId) ?? null,
                ),
              ),
        },
      ];
    }),
  );
}

/** Sprint actif de chaque projet et ses tickets (bornés par le sprint). */
export async function readSprints(
  tx: Tx,
  ids: Ids,
): Promise<Map<string, { key: string; tickets: TicketFact[] }>> {
  const sprints = await tx.sprint.findMany({
    where: { projectId: { in: [...ids] }, status: "active" },
    select: { id: true, projectId: true, key: true },
  });
  const tickets = await tx.ticket.findMany({
    where: { sprintId: { in: sprints.map((sprint) => sprint.id) }, deletedAt: null },
    select: { sprintId: true, key: true, title: true, status: true, updatedAt: true },
  });
  return new Map(
    sprints.map((sprint) => [
      sprint.projectId,
      {
        key: sprint.key,
        tickets: tickets
          .filter((ticket) => ticket.sprintId === sprint.id)
          .map(({ key, title, status, updatedAt }) => ({ key, title, status, updatedAt })),
      },
    ]),
  );
}

/** Dernier événement lisible de chaque projet (liste fermée selon l'audience, jamais `system`). */
export async function readActivity(
  tx: Tx,
  ids: Ids,
  audience: Audience,
): Promise<Map<string, { actor: string | null; at: Date }>> {
  const actions = audience === "client" ? CLIENT_ACTIVITY_ACTIONS : ACTIVITY_ACTIONS;
  const projectIds = [...ids];
  const select = { actorKind: true, actorId: true, occurredAt: true } as const;
  const scoped = await tx.auditLog.findMany({
    where: {
      projectId: { in: projectIds },
      actorKind: { not: "system" },
      ...activityActionsFilter(actions),
    },
    orderBy: [{ projectId: "asc" }, { occurredAt: "desc" }, { id: "desc" }],
    distinct: ["projectId"],
    select: { projectId: true, ...select },
  });
  // `project.create` est une écriture d'organisation (sans projet) : retrouvée par sa cible.
  const creations = (actions as readonly string[]).includes("project.create")
    ? await tx.auditLog.findMany({
        where: {
          action: "project.create",
          targetKind: "project",
          targetId: { in: projectIds },
          actorKind: { not: "system" },
        },
        select: { targetId: true, ...select },
      })
    : [];
  const rows = [
    ...scoped.flatMap((row) =>
      row.projectId === null ? [] : [{ ...row, projectId: row.projectId }],
    ),
    ...creations.map(({ targetId, ...row }) => ({ ...row, projectId: targetId })),
  ];
  const names = await memberNames(
    tx,
    rows.flatMap((row) => (row.actorKind === "human" && row.actorId ? [row.actorId] : [])),
  );
  const latest = new Map<string, { actor: string | null; at: Date }>();
  for (const row of rows) {
    const known = latest.get(row.projectId);
    if (known && known.at >= row.occurredAt) continue;
    const actor =
      row.actorKind === "agent" ? "L'agent" : ((row.actorId && names.get(row.actorId)) ?? null);
    latest.set(row.projectId, { actor, at: row.occurredAt });
  }
  return latest;
}
