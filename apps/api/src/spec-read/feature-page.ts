import { validation } from "../tracker/api-errors.ts";

const FEATURE_ID = /^F-\d{3,}$/;

const numberOf = (specId: string): number => Number(specId.slice(2));

/** Ordre numérique sur F-nnn (F-999 avant F-1000), départagé par l'identifiant. */
export function compareFeatures(a: { specId: string }, b: { specId: string }): number {
  return numberOf(a.specId) - numberOf(b.specId) || a.specId.localeCompare(b.specId);
}

const encodeCursor = (specId: string): string => Buffer.from(specId).toString("base64url");

/** Identifiant de la dernière feature rendue ; `VALIDATION{cursor}` si le curseur n'a pas été émis par nous. */
function decodeCursor(cursor: string): string {
  const specId = Buffer.from(cursor, "base64url").toString("utf8");
  if (!FEATURE_ID.test(specId) || encodeCursor(specId) !== cursor) {
    throw validation("cursor", "Curseur invalide");
  }
  return specId;
}

export interface FeatureWindow<T> {
  items: T[];
  nextCursor: string | null;
  /** Nombre de lignes de la liste triée et rang de la première ligne de la page (0 en tête). */
  total: number;
  offset: number;
}

/**
 * Page d'une liste triée numériquement, par curseur opaque (l'identifiant de la dernière ligne) ou, avec `around`, la page
 * alignée sur `limit` qui contient cette ligne (TK-104, B350) ; une ligne absente de `rows` donne la première page.
 */
export function pageFeatures<T extends { specId: string }>(
  rows: readonly T[],
  limit: number,
  position: { cursor?: string | undefined; around?: string | undefined },
): FeatureWindow<T> {
  const sorted = [...rows].sort(compareFeatures);
  const start = startOf(sorted, limit, position);
  const items = sorted.slice(start, start + limit);
  const last = items.at(-1);
  const more = start + items.length < sorted.length;
  return {
    items,
    nextCursor: more && last ? encodeCursor(last.specId) : null,
    total: sorted.length,
    offset: start,
  };
}

function startOf(
  sorted: readonly { specId: string }[],
  limit: number,
  { cursor, around }: { cursor?: string | undefined; around?: string | undefined },
): number {
  if (cursor !== undefined) {
    const after = { specId: decodeCursor(cursor) };
    const index = sorted.findIndex((row) => compareFeatures(row, after) > 0);
    return index === -1 ? sorted.length : index;
  }
  const rank = around === undefined ? -1 : sorted.findIndex((row) => row.specId === around);
  return rank === -1 ? 0 : rank - (rank % limit);
}
