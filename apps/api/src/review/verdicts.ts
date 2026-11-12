import { latestReview, type ReviewVerdict } from "../client-space/validation.ts";

/** Colonnes d'une review lue pour juger de sa validité : le verdict et le hachage du contenu validé (`review_versions`). */
export const VERDICT_SELECT = {
  id: true,
  status: true,
  sha: true,
  createdAt: true,
  targetKind: true,
  targetRef: true,
  version: { select: { contentHash: true } },
} as const;

export interface VerdictRow {
  id: string;
  status: "approved" | "changes_requested";
  sha: string;
  createdAt: Date;
  targetKind: string;
  targetRef: string;
  version: { contentHash: string } | null;
}

/**
 * Dernier verdict d'une cible, porteur du hachage courant de son contenu : valable tant que ce hachage est celui que la
 * review a validé (B325 b). Sans hachage d'un côté ou de l'autre (review d'avant TK-100, snapshot pas réindexé), la
 * comparaison retombe sur le SHA de tête.
 */
export function verdictOf(
  rows: readonly VerdictRow[],
  currentHash: string | null,
): ReviewVerdict | undefined {
  const latest = latestReview(
    rows.map((row) => ({
      id: row.id,
      status: row.status,
      sha: row.sha,
      createdAt: row.createdAt,
      contentHash: row.version?.contentHash ?? null,
    })),
  );
  return latest && { ...latest, currentHash };
}

/** Index des rows par cible : `kind:ref`. */
export function groupByTarget(rows: readonly VerdictRow[]): Map<string, VerdictRow[]> {
  const groups = new Map<string, VerdictRow[]>();
  for (const row of rows) {
    const key = `${row.targetKind}:${row.targetRef}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}
