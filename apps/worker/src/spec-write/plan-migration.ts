import type { FileChange } from "@koklo/domain";
import { migrateSpecToV2, type SpecFile } from "@koklo/schema";
import { toStoredReport } from "./report.ts";
import { type BatchOperation, conflicted, failed, type Outcome } from "./types.ts";

/** Résultat du plan d'une migration : les changements à commiter, ou un résultat métier sans commit. */
export type MigrationPlan =
  | { readonly changes: readonly FileChange[] }
  | { readonly outcome: Outcome };

function migrate(files: readonly SpecFile[]): MigrationPlan {
  const { changes, issues } = migrateSpecToV2(files);
  return issues.length > 0
    ? { outcome: failed("SPEC_INVALID", toStoredReport(issues)) }
    : { changes };
}

/**
 * Retour arrière : la migration est recalculée sur les fichiers du parent du commit, puis inversée. Chaque fichier
 * que la migration a écrit doit être encore tel qu'elle l'a laissé (et chaque fichier qu'elle a retiré absent), sinon
 * quelqu'un a travaillé dessus depuis : `write_conflict`, rien n'est écrit. Sinon le contenu du parent est rendu.
 */
function revert(head: readonly SpecFile[], parent: readonly SpecFile[]): MigrationPlan {
  const planned = migrateSpecToV2(parent);
  if (planned.issues.length > 0) return { outcome: failed("INTERNAL") };
  const current = new Map(head.map((file) => [file.path, file.content]));
  const before = new Map(parent.map((file) => [file.path, file.content]));
  const changes: FileChange[] = [];
  for (const change of planned.changes) {
    const now = current.get(change.path);
    const moved = "delete" in change ? now !== undefined : now !== change.content;
    if (moved) return { outcome: conflicted("write_conflict") };
    const original = before.get(change.path);
    changes.push(
      original === undefined
        ? { path: change.path, delete: true }
        : { path: change.path, content: original },
    );
  }
  return { changes };
}

/**
 * Lot de migration (TK-106) : `spec.migrate` ou `spec.migrate.revert`, seul dans son lot. Pur ; les droits (owner)
 * sont vérifiés par l'API. `parent` : fichiers lus au parent du commit de la migration (retour arrière seulement) ;
 * absent, le retour arrière est une erreur interne (le commit ou son parent n'a pas été retrouvé).
 */
export function planMigrationBatch(
  operations: readonly BatchOperation[],
  files: readonly SpecFile[],
  parent?: readonly SpecFile[],
): MigrationPlan {
  if (operations[0]?.kind !== "spec.migrate.revert") return migrate(files);
  return parent === undefined ? { outcome: failed("INTERNAL") } : revert(files, parent);
}
