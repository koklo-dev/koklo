import type { FileChange } from "@koklo/domain";
import {
  checkSpec,
  conflictsOf,
  type DocSections,
  docSectionIndex,
  EmitFeatureError,
  emitFeatureMarkdown,
  emitModelMermaid,
  type Feature,
  genreOf,
  parseFeatureMarkdown,
  parseSpecFiles,
  presentAtHead,
  type SpecFile,
  type SpecPathIndex,
  specPathIndex,
} from "@koklo/schema";
import { applyAdr } from "./adrs.ts";
import { applyArchFlow } from "./archflows.ts";
import { refreshArchitecture } from "./architecture-generated.ts";
import { startingPoint } from "./auto-migrate.ts";
import { applyComponent } from "./components.ts";
import { applyDocSection } from "./doc-sections.ts";
import { createdFeature, isDesignLinked, patchedFeature } from "./features.ts";
import { applyFixture } from "./fixtures.ts";
import { applyFlow } from "./flows.ts";
import { applyLayout, isLayoutKind } from "./layout.ts";
import { featurePathOf, isIdeaKind, isMigrationKind } from "./paths.ts";
import { planIdeaBatch } from "./plan-idea.ts";
import { planMigrationBatch } from "./plan-migration.ts";
import { newIssues, toStoredReport } from "./report.ts";
import { applyRole } from "./roles.ts";
import { applyRule } from "./rules.ts";
import { applyTable } from "./tables.ts";
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
  /** Jour de l'enfilage du lot (AAAA-MM-JJ) : date d'une décision nouvelle. */
  readonly today: string;
  /** Sections du document, avec le prochain numéro libre (consommé par les créations du lot). */
  readonly docs: DocSections & { next: number };
}

/** Index par chemins de la tête (partagé avec l'API, B671) et les rôles, lus dans `domain/roles.yaml`. */
interface Index extends SpecPathIndex {
  readonly roles: Set<string>;
}

function rolesOf(files: readonly SpecFile[]): Set<string> {
  const roles = new Set<string>();
  const file = files.filter((f) => f.path === "domain/roles.yaml");
  for (const parsed of parseSpecFiles(file).spec.roles) {
    for (const role of parsed.value.roles) roles.add(role.id);
  }
  return roles;
}

function indexOf(files: readonly SpecFile[], tree: readonly string[]): Index {
  const paths = files.map((file) => file.path);
  return {
    ...specPathIndex(paths),
    roles: rolesOf(files),
    docs: docSectionIndex([...new Set([...tree, ...paths])]),
  };
}

/** Une identité est-elle déjà prise sur la tête ? `layout.save` n'est jamais vérifié : le dernier écrit gagne (B418). */
function present(index: Index, operation: BatchOperation): boolean | undefined {
  if (isLayoutKind(operation.kind)) return undefined;
  if (genreOf(operation) === "role") return index.roles.has(operation.targetSpecId ?? "");
  return presentAtHead(index, operation) ?? false;
}

/** `update` et `delete` visent un élément présent sur la tête ; `create` une identité libre, une seule fois dans le lot. */
const conflictOf = (operations: readonly BatchOperation[], index: Index) =>
  conflictsOf(operations, (operation) => present(index, operation)).length > 0
    ? conflicted("write_conflict")
    : undefined;

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
  if (genre === "component") {
    applyComponent(workspace, operation, workspace.index.components.get(id));
    return;
  }
  if (genre === "archflow") {
    applyArchFlow(workspace, operation, workspace.index.archflows.get(id));
    return;
  }
  if (genre === "adr") {
    applyAdr(workspace, operation, workspace.index.adrs.get(id), workspace.today);
    return;
  }
  if (genre === "doc") {
    applyDocSection(workspace, operation, workspace.docs);
    return;
  }
  if (isLayoutKind(operation.kind)) {
    applyLayout(workspace, operation);
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
  batch: Pick<LoadedBatch, "operations" | "authorRole" | "enqueuedAt">,
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
  const start = startingPoint(batch.operations, files);
  if ("outcome" in start) return start;
  const index = indexOf(start.files, treePaths);
  const conflict = conflictOf(batch.operations, index);
  if (conflict) return { outcome: conflict };
  const workspace: Planned = {
    designer: batch.authorRole === "designer",
    files: new Map(start.files.map((file) => [file.path, file.content])),
    changes: new Map(start.changes.map((change) => [change.path, change])),
    index,
    today: (batch.enqueuedAt ?? new Date()).toISOString().slice(0, 10),
    docs: { ...index.docs, byId: new Map(index.docs.byId), next: index.docs.last + 1 },
  };
  try {
    for (const operation of batch.operations) applyOperation(workspace, operation);
    refreshModel(workspace);
    refreshArchitecture(workspace, treePaths);
    const report = validate(start.files, toFiles(workspace.files));
    return report
      ? { changes: [...workspace.changes.values()], report }
      : { changes: [...workspace.changes.values()] };
  } catch (error) {
    if (error instanceof PlanStop) return { outcome: error.outcome };
    throw error;
  }
}
