import type { Prisma } from "@koklo/db";
import { keysetBy, type ListSource, type Position } from "../tracker/long-list.ts";
import type { Tx } from "../tracker/project-transactions.ts";

/**
 * Liste des règles et des parcours d'un instantané, lue dans l'index générique `spec_entities` (TK-103) : triée par
 * `(sort, id)` (le worker pose `sort` dans l'ordre numérique de `R-nnn`), filtrée par type de règle et par la recherche
 * plein texte (`ids`, `null` sans recherche).
 */
type EntityWhere = Prisma.SpecEntityWhereInput;
export type EntityKind = "rule" | "flow";
export const RULE_TYPES = ["contrainte", "calcul", "workflow"] as const;

const select = { id: true, sort: true, specId: true, path: true, data: true } as const;
export type EntityRow = Prisma.SpecEntityGetPayload<{ select: typeof select }>;

export const entityWhere = (
  snapshotId: string,
  kind: EntityKind,
  ids: readonly string[] | null,
  type?: string,
): EntityWhere => ({
  snapshotId,
  kind,
  ...(ids ? { id: { in: [...ids] } } : {}),
  ...(type ? { data: { path: ["type"], equals: type } } : {}),
});

const after = (position: Position<number>) => keysetBy("sort", position, "gt") as EntityWhere;
const before = (position: Position<number>) => keysetBy("sort", position, "lt") as EntityWhere;
const positionOf = (row: { sort: number; id: string }): Position<number> => ({
  key: row.sort,
  id: row.id,
});

export function entitySource(
  tx: Tx,
  snapshotId: string,
  kind: EntityKind,
  where: EntityWhere,
): ListSource<EntityRow, number> {
  return {
    total: () => tx.specEntity.count({ where }),
    page: (direction, from, take, skip) => {
      const order = direction === "after" ? "asc" : "desc";
      const window = from && (direction === "after" ? after(from) : before(from));
      return tx.specEntity.findMany({
        where: window ? { AND: [where, window] } : where,
        orderBy: [{ sort: order }, { id: order }],
        select,
        take,
        skip,
      });
    },
    countBefore: (position) => tx.specEntity.count({ where: { AND: [where, before(position)] } }),
    locate: async (specId) => {
      const row = await tx.specEntity.findFirst({
        where: { snapshotId, kind, specId },
        select: { id: true, sort: true },
      });
      if (!row) return null;
      const listed = (await tx.specEntity.count({ where: { AND: [where, { id: row.id }] } })) > 0;
      return { position: positionOf(row), listed };
    },
    positionOf,
    encodeKey: (key) => key,
    decodeKey: (raw) => (typeof raw === "number" && Number.isInteger(raw) ? raw : null),
  };
}

/** Comptes par type de règle, sans tenir compte du filtre de type (les compteurs de la légende restent justes). */
export async function ruleTypeFacets(
  tx: Tx,
  snapshotId: string,
  ids: readonly string[] | null,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const type of RULE_TYPES) {
    const n = await tx.specEntity.count({ where: entityWhere(snapshotId, "rule", ids, type) });
    if (n > 0) counts[type] = n;
  }
  return counts;
}
