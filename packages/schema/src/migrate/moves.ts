import { structIssue } from "../issue.ts";
import type { SpecFile } from "../types.ts";
import { deleteOf, type MigrationResult, writeOf } from "./types.ts";

/** Déplacements de chemin sans changement de contenu (D8), hors scénarios traités par motif. */
const FIXED_MOVES: readonly (readonly [string, string])[] = [
  [".koklo/rules.yaml", "design/rules.yaml"],
  ["architecture/overview.md", "architecture/overview/01-contexte.md"],
  ["tech/cahier-technique.md", "tech/cahier-technique/01-objet.md"],
];
const SCENARIO = /^tests\/scenarios\/([^/]+\.yaml)$/;

/** Chemins, hors entités, que la migration lit (sources et cibles) : le worker les ajoute à la lecture de la spec. */
export const MIGRATION_EXTRA_PATHS: readonly string[] = FIXED_MOVES.flat();

function scenarioMoves(files: readonly SpecFile[]): [string, string][] {
  return files.flatMap((file) => {
    const name = SCENARIO.exec(file.path)?.[1];
    return name === undefined ? [] : [[file.path, `quality/scenarios/${name}`] as [string, string]];
  });
}

/** Déplace scénarios, règles de design, vue d'ensemble et cahier technique ; une cible déjà présente refuse. */
export function planMoves(files: readonly SpecFile[]): MigrationResult {
  const content = new Map(files.map((file) => [file.path, file.content]));
  const result: MigrationResult = { changes: [], issues: [] };
  for (const [from, to] of [...FIXED_MOVES, ...scenarioMoves(files)]) {
    const text = content.get(from);
    if (text === undefined) continue;
    if (content.has(to)) {
      const message = `Migration refusée : le fichier cible ${to} existe déjà (source : ${from}).`;
      result.issues.push(structIssue("STRUCT_MIGRATION_TARGET_EXISTS", to, message));
      continue;
    }
    result.changes.push(deleteOf(from), writeOf(to, text));
  }
  return result;
}
