import { validation } from "./api-errors.ts";
import { isUuid } from "./uuid.ts";

/** Taille de page par défaut des listes à curseur (maximum 100, borné par le contrat). */
export const DEFAULT_PAGE_SIZE = 50;

/** Position dans une liste triée par `(clé de tri, id)` : la clé est un instant. */
export interface CursorPosition {
  sortKey: Date;
  id: string;
}

/** Curseur opaque (base64url) sur `(clé de tri, id)` : tri stable même à horodatages égaux. */
export const encodeCursor = (sortKey: Date, id: string): string =>
  Buffer.from(JSON.stringify([sortKey.toISOString(), id])).toString("base64url");

/** `null` si le curseur n'est pas un curseur émis par `encodeCursor` (l'id doit être un UUID). */
export function decodeCursor(cursor: string): CursorPosition | null {
  try {
    const [sortKey, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const date = new Date(sortKey);
    return typeof id === "string" && isUuid(id) && !Number.isNaN(date.getTime())
      ? { sortKey: date, id }
      : null;
  } catch {
    return null;
  }
}

/** Position du curseur reçu, `VALIDATION{cursor}` s'il est mal formé, `null` sans curseur. */
export function positionOf(cursor: string | undefined): CursorPosition | null {
  if (cursor === undefined) {
    return null;
  }
  const position = decodeCursor(cursor);
  if (!position) {
    throw validation("cursor", "Curseur invalide");
  }
  return position;
}

/**
 * Filtre « après le curseur » sur `(champ, id)` : `gt` en tri croissant, `lt` en décroissant.
 * Reprise stable même si plusieurs lignes partagent le même instant.
 */
export function keysetAfter<F extends string>(
  field: F,
  position: CursorPosition,
  direction: "asc" | "desc",
) {
  const op = direction === "asc" ? "gt" : "lt";
  const instant = { [op]: position.sortKey } as { gt?: Date; lt?: Date };
  const tie = { [op]: position.id } as { gt?: string; lt?: string };
  return {
    OR: [
      { [field]: instant } as Record<F, typeof instant>,
      { [field]: position.sortKey, id: tie } as Record<F, Date> & { id: typeof tie },
    ],
  };
}

/** Page à partir de `limit + 1` lignes lues : le surplus signale une page suivante. */
export function pageOfItems<R extends { id: string }, T>(
  rows: R[],
  limit: number,
  sortKeyOf: (row: R) => Date,
  toItem: (row: R) => T,
): { items: T[]; nextCursor: string | null } {
  const last = rows[limit - 1];
  return {
    items: rows.slice(0, limit).map(toItem),
    nextCursor: rows.length > limit && last ? encodeCursor(sortKeyOf(last), last.id) : null,
  };
}
