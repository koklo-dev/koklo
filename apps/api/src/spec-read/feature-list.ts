import type { FeatureSummary } from "@koklo/contract";
import type { Prisma } from "@koklo/db";
import { countsOf, keysetBy, type ListSource, type Position } from "../tracker/long-list.ts";
import type { Tx } from "../tracker/project-transactions.ts";
import type { FeatureFilter } from "./spec-read.repository.ts";

/**
 * Lecture des fonctionnalités d'un instantané en liste longue : filtres, recherche et tri numérique
 * sur `F-nnn` (`spec_number`, départagé par l'identifiant : F-999 vient avant F-1000).
 */
type FeatureWhere = Prisma.SpecFeatureWhereInput;

/** Colonnes d'un résumé, plus le rang de tri et l'identifiant qui servent de position. */
export const featureSelect = {
  id: true,
  specNumber: true,
  specId: true,
  title: true,
  status: true,
  priority: true,
  filePath: true,
  _count: { select: { criteria: true } },
} as const;

/**
 * Fonctionnalités de l'instantané qui passent les filtres. `ids` : résultat de la recherche plein
 * texte (`null` sans recherche) ; une liste vide ne laisse rien passer.
 */
export const featureWhere = (
  snapshotId: string,
  filter: FeatureFilter,
  ids: readonly string[] | null,
): FeatureWhere => ({
  snapshotId,
  ...(filter.status ? { status: filter.status } : {}),
  ...(filter.priority ? { priority: filter.priority } : {}),
  ...(ids ? { id: { in: [...ids] } } : {}),
});

const after = (position: Position<number>) =>
  keysetBy("specNumber", position, "gt") as FeatureWhere;
const before = (position: Position<number>) =>
  keysetBy("specNumber", position, "lt") as FeatureWhere;

type FeatureRow = Prisma.SpecFeatureGetPayload<{ select: typeof featureSelect }>;
const findRows = (tx: Tx, args: Prisma.SpecFeatureFindManyArgs): Promise<FeatureRow[]> =>
  tx.specFeature.findMany({ ...args, select: featureSelect });

const positionOf = (row: { specNumber: number | null; id: string }): Position<number> => ({
  key: row.specNumber ?? 0,
  id: row.id,
});

export function featureSource(
  tx: Tx,
  snapshotId: string,
  where: FeatureWhere,
): ListSource<FeatureRow, number> {
  return {
    total: () => tx.specFeature.count({ where }),
    page: (direction, from, take, skip) => {
      const order = direction === "after" ? "asc" : "desc";
      const window = from && (direction === "after" ? after(from) : before(from));
      return findRows(tx, {
        where: window ? { AND: [where, window] } : where,
        orderBy: [{ specNumber: order }, { id: order }],
        take,
        skip,
      });
    },
    countBefore: (position) => tx.specFeature.count({ where: { AND: [where, before(position)] } }),
    locate: async (specId) => {
      const row = await tx.specFeature.findFirst({
        where: { snapshotId, specId },
        select: { id: true, specNumber: true },
      });
      if (!row) return null;
      const listed = (await tx.specFeature.count({ where: { AND: [where, { id: row.id }] } })) > 0;
      return { position: positionOf(row), listed };
    },
    positionOf,
    encodeKey: (key) => key,
    decodeKey: (raw) => (typeof raw === "number" && Number.isInteger(raw) ? raw : null),
  };
}

/** Comptes par statut et par priorité ; chaque dimension ignore son propre filtre. */
export async function featureFacets(
  tx: Tx,
  snapshotId: string,
  filter: FeatureFilter,
  ids: readonly string[] | null,
) {
  const byStatus = await tx.specFeature.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: featureWhere(snapshotId, { ...filter, status: undefined }, ids),
  });
  const byPriority = await tx.specFeature.groupBy({
    by: ["priority"],
    _count: { _all: true },
    where: featureWhere(snapshotId, { ...filter, priority: undefined }, ids),
  });
  return { status: countsOf(byStatus, "status"), priority: countsOf(byPriority, "priority") };
}

export const toSummary = ({
  _count,
  id: _id,
  specNumber: _number,
  ...row
}: FeatureRow): FeatureSummary => ({
  ...row,
  criteriaCount: _count.criteria,
});
