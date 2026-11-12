import {
  type BusinessRule,
  EmitRuleError,
  emitRuleMarkdown,
  parseRuleMarkdown,
} from "@koklo/schema";
import { slugOf } from "./paths.ts";
import { toStoredReport } from "./report.ts";
import { type BatchOperation, failed } from "./types.ts";
import {
  forbidDesigner,
  invalidEmit,
  removeFile,
  stop,
  type Workspace,
  writeFile,
} from "./workspace.ts";

/** Champs d'une opération `rule.create|update` (contrat 3.1.0), tous facultatifs ici. */
interface RulePayload {
  title?: string;
  type?: BusinessRule["type"];
  statement?: string;
  examples?: string[];
  states?: string[];
  features?: string[];
  tables?: string[];
  endpoints?: string[];
}

const RULE_FILE = /^domain\/rules\/(R-\d{3,})(?:-[^/]*)?\.md$/;

/** Règles de la tête : identifiant -> chemin. */
export function ruleIndex(paths: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const path of paths) {
    const id = RULE_FILE.exec(path)?.[1];
    if (id !== undefined) index.set(id, path);
  }
  return index;
}

/** Chemin d'une règle nouvelle : `domain/rules/R-nnn-<slug du titre>.md`. */
export const rulePathOf = (id: string, title: unknown): string =>
  `domain/rules/${id}-${slugOf(title, "regle")}.md`;

/** Applique les champs présents du payload (`undefined` : inchangé) ; états et fonctionnalités vides : retirés. */
function overlay(base: BusinessRule, payload: RulePayload): BusinessRule {
  const next: BusinessRule = { ...base };
  if (payload.title !== undefined) next.titre = payload.title;
  if (payload.type !== undefined) next.type = payload.type;
  if (payload.statement !== undefined) next.enonce = payload.statement;
  if (payload.examples !== undefined) next.exemples = payload.examples;
  if (payload.states !== undefined) next.etats = payload.states;
  if (payload.features !== undefined) next.fonctionnalites = payload.features;
  if (payload.tables !== undefined) next.tables = payload.tables;
  if (payload.endpoints !== undefined) next.endpoints = payload.endpoints;
  return next;
}

function write(workspace: Workspace, path: string, rule: BusinessRule): void {
  try {
    writeFile(workspace, path, emitRuleMarkdown(rule));
  } catch (error) {
    if (!(error instanceof EmitRuleError)) throw error;
    invalidEmit(path, rule.id, error);
  }
}

function current(workspace: Workspace, path: string): BusinessRule {
  const parsed = parseRuleMarkdown(path, workspace.files.get(path) ?? "");
  return parsed.ok ? parsed.value : stop(failed("SPEC_INVALID", toStoredReport(parsed.issues)));
}

const EMPTY: Omit<BusinessRule, "id"> = {
  type: "contrainte",
  tables: [],
  endpoints: [],
  enonce: "",
  exemples: [],
};

/** `rule.create|update|delete` : `path` est le fichier de la règle sur la tête (vide à la création). */
export function applyRule(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as RulePayload;
  if (operation.kind === "rule.create") {
    const rule = overlay({ ...EMPTY, id }, payload);
    write(workspace, rulePathOf(id, rule.titre), rule);
  } else if (path !== undefined && operation.kind === "rule.delete") {
    removeFile(workspace, path);
  } else if (path !== undefined) {
    write(workspace, path, overlay(current(workspace, path), payload));
  }
}
