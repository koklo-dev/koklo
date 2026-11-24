import {
  type Component,
  EmitComponentError,
  emitComponentYaml,
  parseSpecFiles,
} from "@koklo/schema";
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

/** Champs d'une opération `component.create|update` (contrat 3.9.0), tous facultatifs ici. */
interface ComponentPayload {
  name?: string;
  type?: Component["type"];
  zone?: string;
  responsibility?: string;
  owns?: string[];
  serves?: string[];
  /** Rôles d'entrée (TK-114d, contrat 3.14.0) ; remplace la liste. */
  actors?: string[];
  dependsOn?: { to: string; via: string; async?: boolean }[];
  decisions?: string[];
  /** Phrases du client ; une liste vide retire le résumé. */
  clientSummary?: string[];
}

/** Chemin d'un composant nouveau : `architecture/components/<slug>.yaml` (le slug est l'identifiant sans `C-`). */
export const componentPathOf = (id: string): string =>
  `architecture/components/${id.slice(2)}.yaml`;

/** Applique les champs présents du payload (`undefined` : inchangé). */
function overlay(base: Component, payload: ComponentPayload): Component {
  const { resume_client: _summary, ...rest } = base;
  const next: Component = { ...rest };
  const summary = payload.clientSummary ?? base.resume_client;
  if (summary !== undefined && summary.length > 0) next.resume_client = [...summary];
  if (payload.name !== undefined) next.nom = payload.name;
  if (payload.type !== undefined) next.type = payload.type;
  if (payload.zone !== undefined) next.zone = payload.zone;
  if (payload.responsibility !== undefined) next.responsabilite = payload.responsibility;
  if (payload.owns !== undefined) next.possede = payload.owns;
  if (payload.serves !== undefined) next.sert = payload.serves;
  if (payload.actors !== undefined) next.acteurs = payload.actors;
  if (payload.decisions !== undefined) next.decisions = payload.decisions;
  if (payload.dependsOn !== undefined) {
    next.depend_de = payload.dependsOn.map((dependency) => ({
      vers: dependency.to,
      via: dependency.via,
      ...(dependency.async === true ? { mode: "asynchrone" as const } : {}),
    }));
  }
  return next;
}

function write(workspace: Workspace, path: string, component: Component): void {
  try {
    writeFile(workspace, path, emitComponentYaml(component));
  } catch (error) {
    if (!(error instanceof EmitComponentError)) throw error;
    invalidEmit(path, component.id, error);
  }
}

function current(workspace: Workspace, path: string): Component {
  const content = workspace.files.get(path) ?? "";
  const parsed = parseSpecFiles([{ path, content }]).spec.components[0];
  return parsed?.value ?? stop(failed("SPEC_INVALID", toStoredReport([])));
}

/** `component.create|update|delete` : `path` est le fichier du composant sur la tête (vide à la création). */
export function applyComponent(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as ComponentPayload;
  if (operation.kind === "component.create") {
    const empty: Component = {
      id,
      nom: "",
      type: "service",
      zone: "",
      responsabilite: "",
      possede: [],
      sert: [],
      acteurs: [],
      depend_de: [],
      decisions: [],
    };
    write(workspace, componentPathOf(id), overlay(empty, payload));
  } else if (path !== undefined && operation.kind === "component.delete") {
    removeFile(workspace, path);
  } else if (path !== undefined) {
    write(workspace, path, overlay(current(workspace, path), payload));
  }
}
