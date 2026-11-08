import type { IdeaPageStatus } from "@koklo/domain";
import { notFound } from "../tracker/api-errors.ts";
import { recordAudit } from "../tracker/audit.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaAuthor, IdeaOrigin, IdeaPageRecord } from "./idea.repository.ts";

/** Lectures et écritures partagées du dépôt Prisma de l'espace Idée (TK-89) : sélections, auteurs, ordre. */
export const SUMMARY = {
  id: true,
  slug: true,
  title: true,
  position: true,
  required: true,
  origin: true,
  status: true,
  version: true,
  updatedAt: true,
  updatedBy: true,
  deletedAt: true,
} as const;
export const FULL = { ...SUMMARY, contentMd: true } as const;

export interface Row {
  id: string;
  slug: string;
  title: string;
  position: number;
  required: boolean;
  origin: string;
  status: string;
  version: number;
  updatedAt: Date;
  updatedBy: string | null;
  deletedAt: Date | null;
  contentMd?: string;
}

/** Nom et indicateur client de chaque utilisateur désigné (membres de l'organisation seulement). */
export async function authorsOf(
  tx: Tx,
  organizationId: string,
  userIds: readonly string[],
): Promise<Map<string, IdeaAuthor>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const members = await tx.member.findMany({
    where: { organizationId, userId: { in: ids } },
    select: { userId: true, role: true, user: { select: { name: true } } },
  });
  return new Map(
    members.map((m) => [m.userId, { name: m.user.name, isClient: m.role === "client" }]),
  );
}

export async function recordsOf(
  tx: Tx,
  scope: ProjectScope,
  rows: Row[],
): Promise<IdeaPageRecord[]> {
  const authors = await authorsOf(
    tx,
    scope.organizationId,
    rows.flatMap((row) => (row.updatedBy === null ? [] : [row.updatedBy])),
  );
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    position: row.position,
    required: row.required,
    origin: row.origin as IdeaOrigin,
    status: row.status as IdeaPageStatus,
    version: row.version,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy === null ? null : (authors.get(row.updatedBy) ?? null),
    deletedAt: row.deletedAt,
    ...(row.contentMd === undefined ? {} : { contentMd: row.contentMd }),
  }));
}

export const oneRecord = async (tx: Tx, scope: ProjectScope, row: Row) =>
  (await recordsOf(tx, scope, [row]))[0] as IdeaPageRecord;

export const audit = (
  tx: Tx,
  scope: ProjectScope,
  action: string,
  id: string,
  kind = "idea_page",
) =>
  recordAudit(tx, scope, {
    action,
    targetKind: kind as "idea_page" | "project",
    targetId: id,
  });

/** Un contributeur par (page, membre) : la date du dernier ajout avance. */
export const contribute = async (
  tx: Tx,
  scope: ProjectScope,
  pageId: string,
  now: Date,
): Promise<void> => {
  await tx.ideaPageContributor.upsert({
    where: { pageId_userId: { pageId, userId: scope.userId } },
    create: {
      organizationId: scope.organizationId,
      pageId,
      userId: scope.userId,
      lastAddedAt: now,
    },
    update: { lastAddedAt: now },
  });
};

export const activeOf = (tx: Tx, scope: ProjectScope): Promise<Row[]> =>
  tx.ideaPage.findMany({
    where: { projectId: scope.projectId, deletedAt: null },
    select: SUMMARY,
    orderBy: [{ position: "asc" }, { slug: "asc" }],
  });

/** Nouvelles positions sans toucher à `updatedAt` : un déplacement n'est pas une modification de la page. */
export async function applyOrder(
  tx: Tx,
  rows: { id: string; position: number; updatedAt: Date }[],
) {
  for (const [index, row] of rows.entries()) {
    if (row.position === index) continue;
    await tx.ideaPage.update({
      where: { id: row.id },
      data: { position: index, updatedAt: row.updatedAt },
    });
  }
}

export async function findPage(
  tx: Tx,
  scope: ProjectScope,
  pageId: string,
  active: boolean,
): Promise<Row> {
  const row = await tx.ideaPage.findFirst({
    where: { id: pageId, projectId: scope.projectId, ...(active ? { deletedAt: null } : {}) },
    select: FULL,
  });
  if (!row) throw notFound();
  return row;
}
