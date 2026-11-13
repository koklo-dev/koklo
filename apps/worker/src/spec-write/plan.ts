import type { FileChange } from "@koklo/domain";
import {
  checkSpec,
  EmitFeatureError,
  emitFeatureMarkdown,
  emitModelMermaid,
  type Feature,
  parseFeatureMarkdown,
  parseSpecFiles,
  type SpecFile,
} from "@koklo/schema";
import { createdFeature, isDesignLinked, patchedFeature } from "./features.ts";
import { applyFixture, fixtureIndex } from "./fixtures.ts";
import { applyFlow, flowIndex } from "./flows.ts";
import { featureIdOfPath, featurePathOf, isIdeaKind, isMigrationKind } from "./paths.ts";
import { planIdeaBatch } from "./plan-idea.ts";
import { planMigrationBatch } from "./plan-migration.ts";
import { newIssues, toStoredReport } from "./report.ts";
import { applyRole } from "./roles.ts";
import { applyRule, ruleIndex } from "./rules.ts";
import { applyTable, tableIndex } from "./tables.ts";
import {
  type BatchOperation,
  conflicted,
  failed,
  type LoadedBatch,
  type Outcome,
} from "./types.ts";
import { invalidEmit, PlanStop, removeFile, stop, type Workspace, writeFile } from "./workspace.ts";

/** Ce que le lot donne sur l'état lu : un résultat métier sans commit, ou les changements à commiter. */
export type Plan =
  | { readonly outcome: Outcome }
  | {
      readonly changes: readonly FileChange[];
      readonly report?: ReturnType<typeof toStoredReport>;
    };

interface Planned extends Workspace {
  /** Fichiers de la tête, par genre : identifiant -> chemin (les créations du lot n'y figurent pas). */
  readonly index: Index;
}

interface Index {
  readonly features: Map<string, string>;
  readonly rules: Map<string, string>;
  readonly flows: { owned: Map<string, string>; taken: Set<string> };
  readonly roles: Set<string>;
  readonly tables: Map<string, string>;
  readonly fixtures: Set<string>;
}

function featureIndex(files: readonly SpecFile[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files) {
    const id = featureIdOfPath(file.path);
    if (id !== undefined) index.set(id, file.path);
  }
  return index;
}

/** Genre d'une opération (`feature`, `rule`, `role`, `flow`, `table`, `fixture`) : le préfixe de son `kind`. */
const genreOf = (operation: BatchOperation): string => operation.kind.split(".")[0] ?? "";

function indexOf(files: readonly SpecFile[]): Index {
  const paths = files.map((file) => file.path);
  const roles = new Set<string>();
  if (paths.includes("domain/roles.yaml")) {
    for (const file of parseSpecFiles(files.filter((f) => f.path === "domain/roles.yaml")).spec
      .roles) {
      for (const role of file.value.roles) roles.add(role.id);
    }
  }
  return {
    features: featureIndex(files),
    rules: ruleIndex(paths),
    flows: flowIndex(paths),
    roles,
    tables: tableIndex(paths),
    fixtures: fixtureIndex(paths),
  };
}

/** Une identité est-elle déjà prise sur la tête ? Un `.json` hérité occupe encore l'identifiant de son parcours. */
function present(index: Index, operation: BatchOperation): boolean {
  const id = operation.targetSpecId ?? "";
  const genre = genreOf(operation);
  if (genre === "rule") return index.rules.has(id);
  if (genre === "role") return index.roles.has(id);
  if (genre === "table") return index.tables.has(id);
  if (genre === "fixture") return index.fixtures.has(id);
  if (genre === "flow") {
    const created = operation.kind === "flow.create";
    return created ? index.flows.taken.has(id) : index.flows.owned.has(id);
  }
  return index.features.has(id);
}

/** `update` et `delete` visent un élément présent sur la tête ; `create` une identité libre. */
function conflictOf(operations: readonly BatchOperation[], index: Index) {
  for (const operation of operations) {
    if (operation.kind.endsWith(".create") === present(index, operation)) {
      return conflicted("write_conflict");
    }
  }
  return undefined;
}

function requireDesign(workspace: Workspace, linked: boolean): void {
  if (workspace.designer && !linked) stop(failed("FORBIDDEN"));
}

function write(workspace: Workspace, path: string, id: string, feature: Feature): void {
  try {
    writeFile(workspace, path, emitFeatureMarkdown(feature));
  } catch (error) {
    if (!(error instanceof EmitFeatureError)) throw error;
    invalidEmit(path, id, error);
  }
}

function currentFeature(workspace: Workspace, path: string): Feature {
  const parsed = parseFeatureMarkdown(path, workspace.files.get(path) ?? "");
  return parsed.ok ? parsed.value : stop(failed("SPEC_INVALID", toStoredReport(parsed.issues)));
}

function applyCreate(workspace: Workspace, id: string, operation: BatchOperation): void {
  const feature = createdFeature(id, operation.payload);
  requireDesign(workspace, isDesignLinked(feature));
  write(workspace, featurePathOf(id, feature.titre), id, feature);
}

function applyDelete(workspace: Workspace, path: string): void {
  if (workspace.designer) requireDesign(workspace, isDesignLinked(currentFeature(workspace, path)));
  removeFile(workspace, path);
}

function applyUpdate(workspace: Workspace, id: string, path: string, operation: BatchOperation) {
  const current = currentFeature(workspace, path);
  requireDesign(workspace, isDesignLinked(current));
  const next = patchedFeature(current, operation.payload);
  requireDesign(workspace, isDesignLinked(next));
  write(workspace, path, id, next);
}

function applyOperation(workspace: Planned, operation: BatchOperation): void {
  const id = operation.targetSpecId ?? "";
  const genre = genreOf(operation);
  if (genre === "rule") {
    applyRule(workspace, operation, workspace.index.rules.get(id));
    return;
  }
  if (genre === "role") {
    applyRole(workspace, operation);
    return;
  }
  if (genre === "flow") {
    applyFlow(workspace, operation, workspace.index.flows.owned.get(id));
    return;
  }
  if (genre === "table") {
    applyTable(workspace, operation, workspace.index.tables.get(id));
    return;
  }
  if (genre === "fixture") {
    applyFixture(workspace, operation);
    return;
  }
  const path = workspace.index.features.get(id) ?? "";
  if (operation.kind === "feature.create") {
    applyCreate(workspace, id, operation);
  } else if (operation.kind === "feature.delete") {
    applyDelete(workspace, path);
  } else {
    applyUpdate(workspace, id, path, operation);
  }
}

/** Seules les erreurs NOUVELLES bloquent ; les avertissements nouveaux sont gardés au rapport. */
function validate(before: readonly SpecFile[], after: readonly SpecFile[]) {
  const afterReport = checkSpec(after);
  if (afterReport.issues.length === 0) return undefined;
  const added = newIssues(checkSpec(before).issues, afterReport.issues);
  if (added.some((issue) => issue.severity === "error")) {
    return stop(failed("SPEC_INVALID", toStoredReport(added)));
  }
  return added.length > 0 ? toStoredReport(added) : undefined;
}

const toFiles = (files: Map<string, string>): SpecFile[] =>
  [...files].map(([path, content]) => ({ path, content }));

const MODEL_PATH = "data/model.mmd";

/**
 * `data/model.mmd` est généré, jamais édité (B384) : quand un fichier de `data/tables/` change, le texte Mermaid du modèle est
 * réécrit dans le même lot (donc le même commit) depuis les tables de l'état final.
 */
function refreshModel(workspace: Workspace): void {
  if (![...workspace.changes.keys()].some((path) => path.startsWith("data/tables/"))) return;
  const { spec } = parseSpecFiles(toFiles(workspace.files));
  const tables = spec.tables.flatMap(({ value }) => ("nom" in value ? [value] : []));
  writeFile(workspace, MODEL_PATH, emitModelMermaid(tables));
}

/**
 * Applique les opérations du lot, dans l'ordre, sur l'état lu (chemins relatifs à la spec) :
 * conflits d'abord, puis contrôle du designer opération par opération, puis validation. Pur, tout
 * ou rien : un résultat métier n'a jamais de changement. `parentFiles` : l'état au parent du commit d'une migration (retour arrière).
 */
export function planBatch(
  batch: Pick<LoadedBatch, "operations" | "authorRole">,
  files: readonly SpecFile[],
  treePaths: readonly string[] = files.map((file) => file.path),
  parentFiles?: readonly SpecFile[],
): Plan {
  if (batch.operations.some((operation) => isMigrationKind(operation.kind))) {
    return planMigrationBatch(batch.operations, files, parentFiles);
  }
  if (batch.operations.some((operation) => isIdeaKind(operation.kind))) {
    return planIdeaBatch(batch.operations, treePaths);
  }
  const index = indexOf(files);
  const conflict = conflictOf(batch.operations, index);
  if (conflict) return { outcome: conflict };
  const workspace: Planned = {
    designer: batch.authorRole === "designer",
    files: new Map(files.map((file) => [file.path, file.content])),
    changes: new Map(),
    index,
  };
  try {
    for (const operation of batch.operations) applyOperation(workspace, operation);
    refreshModel(workspace);
    const report = validate(files, toFiles(workspace.files));
    return report
      ? { changes: [...workspace.changes.values()], report }
      : { changes: [...workspace.changes.values()] };
  } catch (error) {
    if (error instanceof PlanStop) return { outcome: error.outcome };
    throw error;
  }
}
