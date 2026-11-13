import type { FileChange } from "@koklo/domain";
import { migrateSpecToV2, parseSpecFiles, type SpecFile } from "@koklo/schema";
import { toStoredReport } from "./report.ts";
import { type BatchOperation, failed, type Outcome } from "./types.ts";

const MANIFEST = "koklo.project.yaml";
/** Genres qui écrivent au format v2 (`data/tables/<slug>.yaml`, jeux, `_layout.yaml`). */
const DATA_GENRES = new Set(["table", "fixture", "layout"]);

/** Le lot écrit-il des Données ? Il lit alors aussi les fichiers que la migration déplace (`MIGRATION_EXTRA_PATHS`). */
export const touchesData = (operations: readonly BatchOperation[]): boolean =>
  operations.some((operation) => DATA_GENRES.has(operation.kind.split(".")[0] ?? ""));

/** État de départ du plan : fichiers (migrés si besoin) et changements de la migration à commiter avec le lot. */
export type StartingPoint =
  | { readonly files: readonly SpecFile[]; readonly changes: readonly FileChange[] }
  | { readonly outcome: Outcome };

function isV1(files: readonly SpecFile[]): boolean {
  const manifest = files.find((file) => file.path === MANIFEST);
  if (manifest === undefined) return false;
  return parseSpecFiles([manifest]).spec.project?.value.spec_version !== 2;
}

function applied(files: readonly SpecFile[], changes: readonly FileChange[]): SpecFile[] {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  for (const change of changes) {
    if ("delete" in change) byPath.delete(change.path);
    else byPath.set(change.path, change.content);
  }
  return [...byPath].map(([path, content]) => ({ path, content }));
}

/**
 * Le worker n'écrit les Données qu'au format v2 : un lot qui touche une table, un jeu ou le placement sur un dépôt
 * encore en v1 (projet créé avant TK-106) migre d'abord la spec, dans le même lot donc le même commit (décision de
 * l'utilisateur du 2026-11-13, C4). La migration est celle de TK-106, tout ou rien : si elle est refusée (spec v1 déjà
 * en erreur, cible existante), le lot est `SPEC_INVALID` avec ses raisons, rien n'est écrit.
 */
export function startingPoint(
  operations: readonly BatchOperation[],
  files: readonly SpecFile[],
): StartingPoint {
  if (!touchesData(operations) || !isV1(files)) return { files, changes: [] };
  const { changes, issues } = migrateSpecToV2(files);
  if (issues.length > 0) return { outcome: failed("SPEC_INVALID", toStoredReport(issues)) };
  return { files: applied(files, changes), changes };
}
