import {
  type ComponentType,
  emitStackYaml,
  parseSpecFiles,
  type Stack,
  stackLayerOf,
  TECHNICAL_PROPOSAL_VOCABULARY,
} from "@koklo/schema";
import { componentPathOf } from "./components.ts";
import { overlaid, readEntity, wordOf, writeEntity } from "./technical-files.ts";
import type { BatchOperation } from "./types.ts";
import { forbidDesigner, removeFile, type Workspace } from "./workspace.ts";

type Words = typeof TECHNICAL_PROPOSAL_VOCABULARY;

interface CriterionPayload {
  label: string;
  estimate?: boolean;
  values?: string[];
}

/** Champs d'une opération `stack.create|update` (contrat 3.17.0), tous facultatifs ici. */
interface StackPayload {
  role?: string;
  layer?: keyof Words["layer"];
  icon?: Stack["icone"];
  components?: string[];
  status?: keyof Words["stackStatus"];
  choice?: string;
  recommended?: string;
  options?: string[];
  criteria?: CriterionPayload[];
  why?: string;
  plain?: string;
  requirements?: string[];
  decisions?: string[];
}

/** Chemin d'un choix nouveau : `tech/stack/<slug>.yaml` (le slug est l'identifiant sans `ST-`). */
export const stackPathOf = (id: string): string => `tech/stack/${id.slice(3)}.yaml`;

const UNKNOWN = "—";

/**
 * Critères du choix après l'opération : les valeurs non fournies sont reprises du fichier pour les options et les critères
 * qui gardent leur nom, « — » sinon (B719).
 */
function criteriaOf(base: Stack, payload: StackPayload, options: readonly string[]) {
  const asked: CriterionPayload[] =
    payload.criteria ?? base.criteres.map((criterion) => ({ label: criterion.nom }));
  return asked.map(({ label, estimate, values }) => {
    const previous = base.criteres.find((criterion) => criterion.nom === label);
    const kept = options.map(
      (option) => previous?.valeurs[base.options.indexOf(option)] ?? UNKNOWN,
    );
    const estimation = estimate ?? previous?.estimation;
    return {
      nom: label,
      ...(estimation === undefined ? {} : { estimation }),
      valeurs: values ?? kept,
    };
  });
}

/** Applique les champs présents de l'opération ; « à trancher » retire le choix, une recommandation sort avec son option. */
function overlay(base: Stack, payload: StackPayload): Stack {
  const words = TECHNICAL_PROPOSAL_VOCABULARY;
  const options = payload.options ?? base.options;
  const next = overlaid(base, {
    role: payload.role,
    couche: wordOf(words.layer, payload.layer),
    icone: payload.icon,
    composants: payload.components,
    statut: wordOf(words.stackStatus, payload.status),
    choix: payload.choice,
    recommande: payload.recommended,
    options: payload.options,
    pourquoi: payload.why,
    en_clair: payload.plain,
    exigences: payload.requirements,
    decisions: payload.decisions,
  });
  next.criteres = criteriaOf(base, payload, options);
  if (payload.status === "open") delete next.choix;
  const stale = payload.recommended === undefined && !options.includes(next.recommande ?? "");
  if (stale) delete next.recommande;
  return next;
}

/** Type du premier composant du choix, lu dans son fichier : il donne la couche d'un choix créé sans elle (B719). */
function firstComponentType(
  workspace: Workspace,
  components: readonly string[] | undefined,
): ComponentType | undefined {
  const id = components?.[0];
  if (id === undefined) return undefined;
  const path = componentPathOf(id);
  const content = workspace.files.get(path);
  if (content === undefined) return undefined;
  return parseSpecFiles([{ path, content }]).spec.components[0]?.value.type;
}

function created(workspace: Workspace, id: string, payload: StackPayload): Stack {
  const empty: Stack = {
    id,
    couche: stackLayerOf(firstComponentType(workspace, payload.components)),
    role: "",
    statut: "a_trancher",
    composants: [],
    options: [],
    criteres: [],
    pourquoi: "",
    exigences: [],
    decisions: [],
  };
  return overlay(empty, payload);
}

/** `stack.create|update|delete` : `path` est le fichier du choix sur la tête (vide à la création). */
export function applyStack(
  workspace: Workspace,
  operation: BatchOperation,
  path: string | undefined,
): void {
  forbidDesigner(workspace);
  const id = operation.targetSpecId ?? "";
  const payload = operation.payload as StackPayload;
  if (operation.kind === "stack.create") {
    const stack = created(workspace, id, payload);
    writeEntity(workspace, stackPathOf(id), id, () => emitStackYaml(stack));
  } else if (path !== undefined && operation.kind === "stack.delete") {
    removeFile(workspace, path);
  } else if (path !== undefined) {
    const stack = overlay(
      readEntity(workspace, path, (spec) => spec.stacks),
      payload,
    );
    writeEntity(workspace, path, id, () => emitStackYaml(stack));
  }
}
