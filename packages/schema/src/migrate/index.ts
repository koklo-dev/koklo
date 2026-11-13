import type { TableV1 } from "../entities/index.ts";
import { structIssue } from "../issue.ts";
import { parseSpecFiles } from "../parse/files.ts";
import type { Issue, SpecFile } from "../types.ts";
import { checkSpec } from "../validate.ts";
import { planEndpoints } from "./endpoints.ts";
import { MIGRATION_EXTRA_PATHS, planMoves } from "./moves.ts";
import { planReferences } from "./references.ts";
import { planTables } from "./tables.ts";
import { type MigrationChange, type MigrationResult, writeOf } from "./types.ts";

export type { MigrationChange, MigrationResult };
export { MIGRATION_EXTRA_PATHS };

const MANIFEST = "koklo.project.yaml";
const VERSION_LINE = /^spec_version:[ \t]*1[ \t]*(?:#.*)?$/m;

const errorsOf = (issues: readonly Issue[]): Issue[] =>
  issues.filter((issue) => issue.severity === "error");

const refused = (issues: Issue[]): MigrationResult => ({ changes: [], issues });

function applyChanges(files: readonly SpecFile[], changes: readonly MigrationChange[]): SpecFile[] {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  for (const change of changes) {
    if ("delete" in change) byPath.delete(change.path);
    else byPath.set(change.path, change.content);
  }
  return [...byPath].map(([path, content]) => ({ path, content }));
}

/** Refus d'entrée : manifeste absent, dépôt déjà v2, ou erreurs de la spec v1 (rien à réparer en silence). */
function sourceProblem(files: readonly SpecFile[]): Issue[] {
  const manifest = files.find((file) => file.path === MANIFEST);
  if (manifest === undefined) {
    return [
      structIssue(
        "STRUCT_MIGRATION_SOURCE_INVALID",
        MANIFEST,
        "Migration refusée : koklo.project.yaml est absent.",
      ),
    ];
  }
  if (!VERSION_LINE.test(manifest.content)) {
    const parsed = parseSpecFiles([manifest]).spec.project?.value.spec_version;
    const message =
      parsed === 2
        ? "Dépôt déjà au format v2 : rien à migrer."
        : "Migration refusée : spec_version: 1 est introuvable dans koklo.project.yaml.";
    const code = parsed === 2 ? "STRUCT_MIGRATION_ALREADY_V2" : "STRUCT_MIGRATION_SOURCE_INVALID";
    return [structIssue(code, MANIFEST, message)];
  }
  return errorsOf(checkSpec(files).issues);
}

/**
 * Migration du format de spec v1 vers v2 (D6 à D8), pure : aucune E/S, mêmes fichiers en entrée, mêmes changements en
 * sortie. Tout ou rien : une issue (dépôt déjà v2, référence inconnue, cible existante, erreur dans la spec obtenue)
 * rend `changes` vide. Le résultat est vérifié par `checkSpec`.
 */
export function migrateSpecToV2(files: readonly SpecFile[]): MigrationResult {
  const problem = sourceProblem(files);
  if (problem.length > 0) return refused(problem);
  const { spec } = parseSpecFiles(files);
  const tables = spec.tables.map((t) => ({ path: t.path, value: t.value as TableV1 }));
  const endpoints = planEndpoints(spec.endpoints);
  const steps = [
    planTables(tables, spec.relations, spec.features),
    endpoints,
    planReferences(spec, files, endpoints.ids),
    planMoves(files),
  ];
  const issues = steps.flatMap((step) => step.issues);
  if (issues.length > 0) return refused(issues);
  const manifest = files.find((file) => file.path === MANIFEST)?.content ?? "";
  const changes = [
    writeOf(MANIFEST, manifest.replace(VERSION_LINE, "spec_version: 2")),
    ...steps.flatMap((step) => step.changes),
  ];
  const after = errorsOf(checkSpec(applyChanges(files, changes)).issues);
  if (after.length > 0) return refused(after);
  return {
    changes: changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    issues: [],
  };
}
