import type { FeatureSummary } from "@koklo/contract";
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

/** Page d'une liste triée numériquement, par curseur opaque (l'identifiant de la dernière ligne). */
export function pageFeatures(
  rows: readonly FeatureSummary[],
  limit: number,
  cursor: string | undefined,
): { items: FeatureSummary[]; nextCursor: string | null } {
  const after = cursor === undefined ? undefined : { specId: decodeCursor(cursor) };
  const sorted = [...rows]
    .sort(compareFeatures)
    .filter((row) => after === undefined || compareFeatures(row, after) > 0);
  const items = sorted.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: sorted.length > limit && last ? encodeCursor(last.specId) : null };
}
