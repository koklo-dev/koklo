import { type ArchFlow, EmitArchFlowError, emitArchFlowYaml, parseSpecFiles } from "@koklo/schema";
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

interface Message {
  from: string;
  to: string;
  text: string;
  reply?: string;
  error?: string;
}
type Item =
  | Message
  | { block: "alt"; label: string; messages: Message[] }
  | { block: "separator"; label: string };

/** Champs d'une opération `archflow.create|update` (contrat 3.9.0), tous facultatifs ici. */
interface ArchFlowPayload {
  flow?: string;
  participants?: string[];
  messages?: Item[];
  features?: string[];
  rules?: string[];
  decisions?: string[];
}

const FLOW_FILE = /^architecture\/flows\/(P-[a-z0-9][a-z0-9-]*)\.yaml$/;

/** Chemin du flux technique d'un parcours : `architecture/flows/<P-id>.yaml` (son `.mmd` porte le même nom). */
export const archFlowPathOf = (id: string): string => `architecture/flows/${id}.yaml`;
export const archFlowMermaidPathOf = (id: string): string => `architecture/flows/${id}.mmd`;

/** Flux de la tête : identifiant du parcours -> chemin. */
export function archFlowIndex(paths: Iterable<string>): Map<string, string> {
  const index = new Map<string, string>();
  for (const path of paths) {
    const id = FLOW_FILE.exec(path)?.[1];
    if (id !== undefined) index.set(id, path);
  }
  return index;
}

const message = (value: Message) => ({
  de: value.from,
  vers: value.to,
  texte: value.text,
  ...(value.reply === undefined ? {} : { retour: value.reply }),
  ...(value.error === undefined ? {} : { erreur: value.error }),
});

const item = (value: Item): ArchFlow["messages"][number] => {
  if (!("block" in value)) return message(value);
  if (value.block === "separator") return { bloc: "separateur", libelle: value.label };
  return { bloc: "alt", libelle: value.label, messages: value.messages.map(message) };
};

function overlay(base: ArchFlow, payload: ArchFlowPayload): ArchFlow {
  const next: ArchFlow = { ...base };
  if (payload.participants !== undefined) next.participants = payload.participants;
  if (payload.messages !== undefined) next.messages = payload.messages.map(item);
  if (payload.features !== undefined) next.fonctionnalites = payload.features;
  if (payload.rules !== undefined) next.regles = payload.rules;
  if (payload.decisions !== undefined) next.decisions = payload.decisions;
  return next;
}

function write(workspace: Workspace, path: string, flow: ArchFlow): void {
  try {
    writeFile(workspace, path, emitArchFlowYaml(flow));
  } catch (error) {
    if (!(error instanceof EmitArchFlowError)) throw error;
    invalidEmit(path, flow.id, error);
  }
}

function current(workspace: Workspace, path: string): ArchFlow {
  const content = workspace.files.get(path) ?? "";
  const parsed = parseSpecFiles([{ path, content }]).spec.archFlows[0];
  return parsed?.value ?? stop(failed("SPEC_INVALID", toStoredReport([])));
}

/** `archflow.create|update|delete` : le `.mmd` suit le `.yaml` (régénéré par `refreshArchitecture`). */
export function applyArchFlow(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as ArchFlowPayload;
  if (operation.kind === "archflow.create") {
    const empty: ArchFlow = {
      id,
      participants: [],
      messages: [],
      fonctionnalites: [],
      regles: [],
      decisions: [],
    };
    write(workspace, archFlowPathOf(id), overlay(empty, payload));
  } else if (path !== undefined && operation.kind === "archflow.delete") {
    removeFile(workspace, path);
  } else if (path !== undefined) {
    write(workspace, path, overlay(current(workspace, path), payload));
  }
}
