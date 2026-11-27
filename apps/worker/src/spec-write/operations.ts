import {
  type Component,
  emitOperationYaml,
  type Operation,
  parseSpecFiles,
  TECHNICAL_PROPOSAL_VOCABULARY,
} from "@koklo/schema";
import { overlaid, readEntity, wordOf, writeEntity } from "./technical-files.ts";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, removeFile, type Workspace } from "./workspace.ts";

type Words = typeof TECHNICAL_PROPOSAL_VOCABULARY;
type Field = { field: string; type: string; constraint?: string; note?: string };

/** Champs d'une opération `op.create|update` (contrat 3.17.0), tous facultatifs ici. */
interface OperationPayload {
  type?: keyof Words["operationType"];
  zone?: string;
  component?: string;
  summary?: string;
  permission?: string;
  input?: Field[];
  output?: Field[];
  errors?: { code: string; when: string; rule?: string }[];
  rules?: string[];
  features?: string[];
  rateLimit?: string;
}

/** Chemin d'une opération nouvelle : `api/endpoints/<zone.verbe>.yaml`. */
export const operationPathOf = (id: string): string => `api/endpoints/${id}.yaml`;

/** Liste de champs -> dictionnaire du fichier, dans l'ordre de la liste. */
const fieldsOf = (fields: readonly Field[] | undefined, extra: "constraint" | "note") =>
  fields &&
  Object.fromEntries(
    fields.map((entry) => {
      const value = entry[extra];
      const name = extra === "constraint" ? "contrainte" : "note";
      return [entry.field, { type: entry.type, ...(value ? { [name]: value } : {}) }];
    }),
  );

const errorsOf = (errors: OperationPayload["errors"]) =>
  errors?.map(({ code, when, rule }) => ({
    code,
    quand: when,
    ...(rule === undefined ? {} : { regle: rule }),
  }));

function overlay(base: Operation, payload: OperationPayload): Operation {
  const permission = payload.permission === "internal" ? "interne" : payload.permission;
  return overlaid(base, {
    type: wordOf(TECHNICAL_PROPOSAL_VOCABULARY.operationType, payload.type),
    zone: payload.zone,
    composant: payload.component,
    permission,
    resume: payload.summary,
    entree: fieldsOf(payload.input, "constraint"),
    sortie: fieldsOf(payload.output, "note"),
    erreurs: errorsOf(payload.errors),
    regles: payload.rules,
    sert: payload.features,
    limite: payload.rateLimit,
  });
}

const COMPONENTS_DIR = "architecture/components/";

/** Composants lisibles des fichiers de la branche, rangés par identifiant. */
function componentsOf(workspace: Workspace): Component[] {
  const files = [...workspace.files]
    .filter(([path]) => path.startsWith(COMPONENTS_DIR))
    .map(([path, content]) => ({ path, content }));
  const parsed = parseSpecFiles(files).spec.components.map((entry) => entry.value);
  return parsed.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Composant d'une opération créée sans lui (B769) : premier service de la zone par identifiant, sinon premier service,
 * sinon premier composant de la zone, sinon premier composant ; sans aucun composant, vide (l'émission refuse le lot).
 */
function deducedComponent(workspace: Workspace, zone: string): string {
  const all = componentsOf(workspace);
  const services = all.filter((component) => component.type === "service");
  const inZone = (component: Component) => component.zone === zone;
  const found = services.find(inZone) ?? services[0] ?? all.find(inZone) ?? all[0];
  return found?.id ?? "";
}

const emptyOperation = (id: string, composant: string): Operation => ({
  id,
  type: "lecture",
  zone: "",
  composant,
  permission: "interne",
  resume: "",
  entree: {},
  sortie: {},
  erreurs: [],
  regles: [],
  sert: [],
});

/**
 * `op.create|update|delete`. L'ancien format REST reste lu et n'est jamais écrit ni supprimé (B720) : le lire comme une
 * opération échoue (`SPEC_INVALID`).
 */
export function applyOperationFile(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as OperationPayload;
  if (operation.kind === "op.create") {
    const component = payload.component ?? deducedComponent(workspace, payload.zone ?? "");
    const next = overlay(emptyOperation(id, component), payload);
    writeEntity(workspace, operationPathOf(id), id, () => emitOperationYaml(next));
    return;
  }
  if (path === undefined) return;
  const current = readEntity(workspace, path, (spec) => spec.operations);
  if (operation.kind === "op.delete") removeFile(workspace, path);
  else writeEntity(workspace, path, id, () => emitOperationYaml(overlay(current, payload)));
}
