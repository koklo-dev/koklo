import type { FileChange } from "@koklo/domain";
import {
  checkSpec,
  conflictsOf,
  type DocSectionDeliverable,
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
import { refreshSecurity } from "./abuse-generated.ts";
import { applyAdr } from "./adrs.ts";
import { applyArchFlow } from "./archflows.ts";
import { refreshArchitecture } from "./architecture-generated.ts";
import { applyAsvs } from "./asvs.ts";
import { startingPoint } from "./auto-migrate.ts";
import { applyComponent } from "./components.ts";
import { applyDocSection, type OpenSections } from "./doc-sections.ts";
import { applyEnvironment, ENVIRONMENTS_PATH } from "./environments.ts";
import { createdFeature, isDesignLinked, patchedFeature } from "./features.ts";
import { applyFixture } from "./fixtures.ts";
import { applyFlow } from "./flows.ts";
import { applyLayout, isLayoutKind } from "./layout.ts";
import { applyOperationFile } from "./operations.ts";
import { featurePathOf, isIdeaKind, isMigrationKind } from "./paths.ts";
import { planIdeaBatch } from "./plan-idea.ts";
import { planMigrationBatch } from "./plan-migration.ts";
import { newIssues, toStoredReport } from "./report.ts";
import { applyRequirement } from "./requirements.ts";
import { applyRight } from "./rights.ts";
import { applyRole } from "./roles.ts";
import { applyRule } from "./rules.ts";
import { secretRefusal } from "./secret-check.ts";
import { applySummary } from "./security-summary.ts";
import { applySensitive, SECURITY_DATA_PATH } from "./sensitive.ts";
import { applyStack } from "./stacks.ts";
import { applyTable } from "./tables.ts";
import { applyThreat } from "./threats.ts";
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
  /** Sections de chaque document. */
  readonly documents: Readonly<Record<DocSectionDeliverable, OpenSections>>;
}

/**
 * Index par chemins de la tête (partagé avec l'API, B671), les rôles (`domain/roles.yaml`), les environnements
 * (`tech/environments.yaml`) et les entrées de `security/data.yaml` (premier champ), lus dans leur fichier.
 */
interface Index extends SpecPathIndex {
  readonly roles: Set<string>;
  readonly environments: Set<string>;
  readonly entries: Set<string>;
}

function rolesOf(files: readonly SpecFile[]): Set<string> {
  const roles = new Set<string>();
  const file = files.filter((f) => f.path === "domain/roles.yaml");
  for (const parsed of parseSpecFiles(file).spec.roles) {
    for (const role of parsed.value.roles) roles.add(role.id);
  }
  return roles;
}

function environmentsOf(files: readonly SpecFile[]): Set<string> {
  const file = files.filter((f) => f.path === ENVIRONMENTS_PATH);
  const [parsed] = parseSpecFiles(file).spec.environments;
  return new Set(parsed?.value.environnements.map((entry) => entry.id));
}

function entriesOf(files: readonly SpecFile[]): Set<string> {
  const file = files.filter((f) => f.path === SECURITY_DATA_PATH);
  const [parsed] = parseSpecFiles(file).spec.securityData;
  return new Set(parsed?.value.donnees.map((entry) => entry.champs[0] as string));
}

function indexOf(files: readonly SpecFile[], tree: readonly string[]): Index {
  const paths = files.map((file) => file.path);
  const all = [...new Set([...tree, ...paths])];
  return {
    ...specPathIndex(paths),
    roles: rolesOf(files),
    environments: environmentsOf(files),
    entries: entriesOf(files),
    docs: docSectionIndex(all),
    techDocs: docSectionIndex(all, "technical"),
    securityDocs: docSectionIndex(all, "security"),
  };
}

/** Sections ouvertes à l'écriture : une copie de l'index et le numéro suivant. */
const openSections = (sections: DocSections): OpenSections => ({
  ...sections,
  byId: new Map(sections.byId),
  next: sections.last + 1,
});

/** Sans identité vérifiable dans un fichier : restrictions, exigences et résumé de la Sécurité. */
const UNCHECKED: ReadonlySet<string> = new Set(["right", "asvs", "summary"]);

/**
 * Une identité est-elle déjà prise sur la tête ? `layout.save` n'est jamais vérifié : le dernier écrit gagne (B418). Une
 * donnée créée n'est pas vérifiée ici : un champ déjà classé rend `data.yaml` invalide.
 */
function present(index: Index, operation: BatchOperation): boolean | undefined {
  const genre = genreOf(operation);
  if (isLayoutKind(operation.kind) || UNCHECKED.has(genre)) return undefined;
  if (operation.kind === "sensitive.create") return undefined;
  if (genre === "sensitive") return index.entries.has(operation.targetSpecId ?? "");
  if (genre === "role") return index.roles.has(operation.targetSpecId ?? "");
  if (genre === "env") return index.environments.has(operation.targetSpecId ?? "");
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

function applyFeature(workspace: Planned, operation: BatchOperation, id: string): void {
  const path = workspace.index.features.get(id) ?? "";
  if (operation.kind === "feature.create") applyCreate(workspace, id, operation);
  else if (operation.kind === "feature.delete") applyDelete(workspace, path);
  else applyUpdate(workspace, id, path, operation);
}

type Apply = (workspace: Planned, operation: BatchOperation, id: string) => void;

/** Écriture de chaque genre d'opération (préfixe du `kind`) ; la mise en page et les features sont à part. */
const APPLY: Readonly<Record<string, Apply>> = {
  rule: (w, op, id) => applyRule(w, op, w.index.rules.get(id)),
  role: (w, op) => applyRole(w, op),
  flow: (w, op, id) => applyFlow(w, op, w.index.flows.owned.get(id)),
  table: (w, op, id) => applyTable(w, op, w.index.tables.get(id)),
  fixture: (w, op) => applyFixture(w, op),
  component: (w, op, id) => applyComponent(w, op, w.index.components.get(id)),
  archflow: (w, op, id) => applyArchFlow(w, op, w.index.archflows.get(id)),
  adr: (w, op, id) => applyAdr(w, op, w.index.adrs.get(id), w.today),
  doc: (w, op) => applyDocSection(w, op, w.documents),
  stack: (w, op, id) => applyStack(w, op, w.index.stacks.get(id)),
  op: (w, op, id) => applyOperationFile(w, op, w.index.endpoints.get(id)),
  nfr: (w, op, id) => applyRequirement(w, op, w.index.nfr.get(id)),
  env: (w, op) => applyEnvironment(w, op),
  threat: (w, op, id) => applyThreat(w, op, w.index.threats.get(id)),
  sensitive: (w, op) => applySensitive(w, op),
  right: (w, op) => applyRight(w, op),
  asvs: (w, op) => applyAsvs(w, op),
  summary: (w, op) => applySummary(w, op),
};

function applyOperation(workspace: Planned, operation: BatchOperation): void {
  if (isLayoutKind(operation.kind)) {
    applyLayout(workspace, operation);
    return;
  }
  const apply = APPLY[genreOf(operation)] ?? applyFeature;
  apply(workspace, operation, operation.targetSpecId ?? "");
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
 * valeurs de secret refusées d'abord, puis conflits, puis contrôle du designer opération par opération, puis validation. Pur, tout
 * ou rien : un résultat métier n'a jamais de changement. `parentFiles` : l'état au parent du commit d'une migration (retour arrière).
 */
export function planBatch(
  batch: Pick<LoadedBatch, "operations" | "authorRole" | "enqueuedAt">,
  files: readonly SpecFile[],
  treePaths: readonly string[] = files.map((file) => file.path),
  parentFiles?: readonly SpecFile[],
): Plan {
  const refused = secretRefusal(batch.operations);
  if (refused !== undefined) return { outcome: refused };
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
    documents: {
      architecture: openSections(index.docs),
      technical: openSections(index.techDocs),
      security: openSections(index.securityDocs),
    },
  };
  try {
    for (const operation of batch.operations) applyOperation(workspace, operation);
    refreshModel(workspace);
    refreshArchitecture(workspace, treePaths);
    refreshSecurity(workspace, batch.operations, treePaths);
    const report = validate(start.files, toFiles(workspace.files));
    return report
      ? { changes: [...workspace.changes.values()], report }
      : { changes: [...workspace.changes.values()] };
  } catch (error) {
    if (error instanceof PlanStop) return { outcome: error.outcome };
    throw error;
  }
}
