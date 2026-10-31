import type { FileChange } from "@koklo/domain";
import {
  checkSpec,
  EmitFeatureError,
  emitFeatureMarkdown,
  type Feature,
  parseFeatureMarkdown,
  type SpecFile,
} from "@koklo/schema";
import { createdFeature, isDesignLinked, patchedFeature } from "./features.ts";
import { featureIdOfPath, featurePathOf } from "./paths.ts";
import { newIssues, toStoredReport } from "./report.ts";
import {
  type BatchOperation,
  conflicted,
  failed,
  type LoadedBatch,
  type Outcome,
  type ReportIssue,
} from "./types.ts";

/** Ce que le lot donne sur l'état lu : un résultat métier sans commit, ou les changements à commiter. */
export type Plan =
  | { readonly outcome: Outcome }
  | {
      readonly changes: readonly FileChange[];
      readonly report?: ReturnType<typeof toStoredReport>;
    };

/** Arrêt du calcul avec un résultat métier (conflit, interdit, spec invalide). */
class PlanStop extends Error {
  readonly outcome: Outcome;
  constructor(outcome: Outcome) {
    super("plan stopped");
    this.outcome = outcome;
  }
}

interface Workspace {
  readonly designer: boolean;
  readonly files: Map<string, string>;
  readonly changes: Map<string, FileChange>;
  readonly index: Map<string, string>;
}

function stop(outcome: Outcome): never {
  throw new PlanStop(outcome);
}

function featureIndex(files: readonly SpecFile[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files) {
    const id = featureIdOfPath(file.path);
    if (id !== undefined) index.set(id, file.path);
  }
  return index;
}

/** `update` et `delete` visent une feature présente sur la tête ; `create` une identité libre. */
function conflictOf(operations: readonly BatchOperation[], index: Map<string, string>) {
  for (const operation of operations) {
    const present = index.has(operation.targetSpecId ?? "");
    if ((operation.kind === "feature.create") === present) return conflicted("write_conflict");
  }
  return undefined;
}

function requireDesign(workspace: Workspace, linked: boolean): void {
  if (workspace.designer && !linked) stop(failed("FORBIDDEN"));
}

function issueOfEmit(path: string, id: string, error: EmitFeatureError): ReportIssue {
  return {
    rule: "structure",
    code: "STRUCT_SCHEMA_VIOLATION",
    severity: "error",
    path,
    pointer: error.path,
    entityId: id,
    message: error.message,
  };
}

function write(workspace: Workspace, path: string, id: string, feature: Feature): void {
  let content: string;
  try {
    content = emitFeatureMarkdown(feature);
  } catch (error) {
    if (!(error instanceof EmitFeatureError)) throw error;
    stop(failed("SPEC_INVALID", toStoredReport([issueOfEmit(path, id, error)])));
  }
  workspace.files.set(path, content);
  workspace.changes.set(path, { path, content });
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
  workspace.files.delete(path);
  workspace.changes.set(path, { path, delete: true });
}

function applyUpdate(workspace: Workspace, id: string, path: string, operation: BatchOperation) {
  const current = currentFeature(workspace, path);
  requireDesign(workspace, isDesignLinked(current));
  const next = patchedFeature(current, operation.payload);
  requireDesign(workspace, isDesignLinked(next));
  write(workspace, path, id, next);
}

function applyOperation(workspace: Workspace, operation: BatchOperation): void {
  const id = operation.targetSpecId ?? "";
  const path = workspace.index.get(id) ?? "";
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

/**
 * Applique les opérations du lot, dans l'ordre, sur l'état lu (chemins relatifs à la spec) :
 * conflits d'abord, puis contrôle du designer opération par opération, puis validation. Pur, tout
 * ou rien : un résultat métier n'a jamais de changement.
 */
export function planBatch(
  batch: Pick<LoadedBatch, "operations" | "authorRole">,
  files: readonly SpecFile[],
): Plan {
  const index = featureIndex(files);
  const conflict = conflictOf(batch.operations, index);
  if (conflict) return { outcome: conflict };
  const workspace: Workspace = {
    designer: batch.authorRole === "designer",
    files: new Map(files.map((file) => [file.path, file.content])),
    changes: new Map(),
    index,
  };
  try {
    for (const operation of batch.operations) applyOperation(workspace, operation);
    const report = validate(files, toFiles(workspace.files));
    return report
      ? { changes: [...workspace.changes.values()], report }
      : { changes: [...workspace.changes.values()] };
  } catch (error) {
    if (error instanceof PlanStop) return { outcome: error.outcome };
    throw error;
  }
}
