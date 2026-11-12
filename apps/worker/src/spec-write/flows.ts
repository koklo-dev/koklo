import { EmitFlowError, emitFlowYaml, type Flow, parseFlowFile } from "@koklo/schema";
import { toStoredReport } from "./report.ts";
import { type BatchOperation, failed } from "./types.ts";
import { invalidEmit, removeFile, stop, type Workspace, writeFile } from "./workspace.ts";

interface Step {
  label: string;
  screen?: string;
}

/** Champs d'une opération `flow.create|update` (contrat 3.1.0), tous facultatifs ici. */
interface FlowPayload {
  title?: string;
  actor?: string;
  start?: Step;
  steps?: Step[];
  errors?: { step: number; text: string }[];
  features?: string[];
}

const FLOW_FILE = /^design\/flows\/(P-[^/]*?)\.(?:yaml|json)$/;

/** Chemin d'un parcours nouveau : `design/flows/P-<slug>.yaml`. */
export const flowPathOf = (id: string): string => `design/flows/${id}.yaml`;

/**
 * Parcours de la tête : identifiant -> chemin. Un `.json` hérité (`P-001-inscription.json`) occupe aussi son identifiant
 * `P-001` : on ne crée jamais un second fichier pour lui. Seul un `.yaml` se modifie ou se supprime.
 */
export function flowIndex(paths: Iterable<string>): {
  owned: Map<string, string>;
  taken: Set<string>;
} {
  const owned = new Map<string, string>();
  const taken = new Set<string>();
  for (const path of paths) {
    const stem = FLOW_FILE.exec(path)?.[1];
    if (stem === undefined) continue;
    taken.add(stem);
    if (path.endsWith(".yaml")) owned.set(stem, path);
  }
  return { owned, taken };
}

const step = (value: Step) => ({
  libelle: value.label,
  ...(value.screen === undefined ? {} : { ecran: value.screen }),
});

function overlay(base: Flow, payload: FlowPayload): Flow {
  const next: Flow = { ...base };
  if (payload.title !== undefined) next.titre = payload.title;
  if (payload.actor !== undefined) next.acteur = payload.actor;
  if (payload.start !== undefined) next.depart = step(payload.start);
  if (payload.steps !== undefined) next.etapes = payload.steps.map(step);
  if (payload.errors !== undefined) {
    next.erreurs = payload.errors.map((error) => ({ etape: error.step, texte: error.text }));
  }
  if (payload.features !== undefined) next.fonctionnalites = payload.features;
  return next;
}

function write(workspace: Workspace, path: string, flow: Flow): void {
  try {
    writeFile(workspace, path, emitFlowYaml(flow));
  } catch (error) {
    if (!(error instanceof EmitFlowError)) throw error;
    invalidEmit(path, flow.id, error);
  }
}

function current(workspace: Workspace, path: string): Flow {
  const parsed = parseFlowFile(path, workspace.files.get(path) ?? "");
  return parsed.ok ? parsed.value : stop(failed("SPEC_INVALID", toStoredReport(parsed.issues)));
}

/** `flow.create|update|delete` : le designer écrit les parcours (design). */
export function applyFlow(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
): void {
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as FlowPayload;
  if (operation.kind === "flow.create") {
    const empty: Flow = {
      id,
      titre: "",
      acteur: "",
      depart: { libelle: "" },
      etapes: [],
      erreurs: [],
      fonctionnalites: [],
    };
    write(workspace, flowPathOf(id), overlay(empty, payload));
  } else if (path !== undefined && operation.kind === "flow.delete") {
    removeFile(workspace, path);
  } else if (path !== undefined) {
    write(workspace, path, overlay(current(workspace, path), payload));
  }
}
