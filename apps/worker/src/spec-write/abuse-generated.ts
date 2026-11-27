import {
  ABUSE_SCENARIO_DIR,
  abuseScenarioFiles,
  emitRightsYaml,
  isAbuseScenarioPath,
  type ParsedSpec,
  parseSpecFiles,
  rightsFileOf,
} from "@koklo/schema";
import { RIGHTS_PATH } from "./rights.ts";
import { readSummary, SUMMARY_PATH, writeSummary } from "./security-summary.ts";
import { readSecurityData, SECURITY_DATA_PATH } from "./sensitive.ts";
import { threatPathOf } from "./threats.ts";
import type { BatchOperation } from "./types.ts";
import { removeFile, type Workspace, writeFile } from "./workspace.ts";

const SECURITY_GENRES: readonly string[] = ["threat", "sensitive", "right", "asvs", "summary"];

const isSecurityOperation = ({ kind, payload }: BatchOperation): boolean =>
  SECURITY_GENRES.includes(kind.split(".")[0] ?? "") || payload.deliverable === "security";

/** Tout lot de la Sécurité ; un lot de rôles quand la matrice existe déjà (B793). */
const regenerates = (workspace: Workspace, operations: readonly BatchOperation[]): boolean =>
  operations.some(isSecurityOperation) ||
  (workspace.files.has(RIGHTS_PATH) &&
    operations.some((operation) => operation.kind.startsWith("role.")));

const writeGenerated = (workspace: Workspace, path: string, content: string): void => {
  if (workspace.files.get(path) !== content) writeFile(workspace, path, content);
};

/**
 * Matrice recalculée depuis les rôles, restrictions et règles conservées. Sans rôles, ou avec un fichier illisible, rien
 * n'est réécrit (les restrictions ne se perdent jamais).
 */
function refreshRights(workspace: Workspace, spec: ParsedSpec) {
  const roles = spec.roles[0]?.value;
  const previous = spec.rights[0]?.value;
  if (!roles || (previous === undefined && workspace.files.has(RIGHTS_PATH))) return previous;
  const next = rightsFileOf(roles, previous);
  writeGenerated(workspace, RIGHTS_PATH, emitRightsYaml(next));
  return next;
}

const RIGHTS_SCENARIO_PREFIX = `${ABUSE_SCENARIO_DIR}/droits-`;

/**
 * Scénario dont la source existe mais ne se lit pas (matrice inconnue, ou menace illisible) : il reste tel quel, sa
 * suppression ferait perdre un test d'abus sans le dire (B836).
 */
function unreadSource(workspace: Workspace, spec: ParsedSpec, matrixKnown: boolean) {
  const read = new Set<string>(spec.threats.map((entry) => entry.value.id));
  return (path: string): boolean => {
    if (path.startsWith(RIGHTS_SCENARIO_PREFIX)) return !matrixKnown;
    const id = path.slice(ABUSE_SCENARIO_DIR.length + 1, -".feature".length);
    return workspace.files.has(threatPathOf(id)) && !read.has(id);
  };
}

/**
 * Scénarios d'abus de l'état final ; un fichier généré devenu inutile est supprimé, tout autre est laissé, comme celui
 * dont la source est illisible.
 */
function refreshScenarios(workspace: Workspace, spec: ParsedSpec, tree: Iterable<string>) {
  const rights = refreshRights(workspace, spec);
  const files = abuseScenarioFiles({
    threats: spec.threats.map((entry) => entry.value),
    matrix: rights?.matrice ?? [],
    roles: spec.roles[0]?.value,
    features: spec.features.map((entry) => entry.value),
    operations: spec.operations.map((entry) => entry.value),
  });
  for (const file of files) writeGenerated(workspace, file.path, file.content);
  const kept = new Set(files.map((file) => file.path));
  const unread = unreadSource(workspace, spec, rights !== undefined);
  for (const path of new Set([...tree, ...workspace.files.keys()])) {
    const removed = workspace.changes.get(path)?.delete === true;
    const stale = isAbuseScenarioPath(path) && !kept.has(path) && !unread(path);
    if (stale && !removed) removeFile(workspace, path);
  }
}

/** La carte de conservation d'un résumé existant suit les durées saisies, dans le même commit. */
function refreshRetention(workspace: Workspace): void {
  if (!workspace.changes.has(SECURITY_DATA_PATH) || !workspace.files.has(SUMMARY_PATH)) return;
  writeSummary(workspace, readSummary(workspace), readSecurityData(workspace).donnees);
}

/**
 * `security/rights.yaml` et `quality/scenarios/abuse/*.feature` sont générés, jamais édités (B793) : réécrits dans le même
 * lot (donc le même commit) depuis l'état final. `tree` : chemins de la tête (les scénarios ne sont pas lus).
 */
export function refreshSecurity(
  workspace: Workspace,
  operations: readonly BatchOperation[],
  tree: Iterable<string>,
): void {
  if (!regenerates(workspace, operations)) return;
  refreshRetention(workspace);
  const files = [...workspace.files].map(([path, content]) => ({ path, content }));
  refreshScenarios(workspace, parseSpecFiles(files).spec, tree);
}
