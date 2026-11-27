import {
  type ArchFlow,
  ArchFlowSchema,
  type Component,
  type ComponentInput,
  ComponentSchema,
} from "../entities/index.ts";
import { EmitError } from "./errors.ts";
import { emitYaml, listIf } from "./yaml-document.ts";

export class EmitComponentError extends EmitError {
  static readonly fallback = "composant invalide";
  constructor(message: string, path: string) {
    super("EmitComponentError", message, path);
  }
}

export class EmitArchFlowError extends EmitError {
  static readonly fallback = "flux invalide";
  constructor(message: string, path: string) {
    super("EmitArchFlowError", message, path);
  }
}

const dependency = (value: Component["depend_de"][number]) => ({
  vers: value.vers,
  via: value.via,
  ...(value.mode === undefined ? {} : { mode: value.mode }),
});

/**
 * Composant -> YAML canonique (`architecture/components/<slug>.yaml`) : clés dans un ordre FIXE, listes vides omises.
 * Pure ; ne lève que `EmitComponentError`. Relu par `parseSpecFiles`, l'émission est idempotente.
 */
export const emitComponentYaml = (component: Component | ComponentInput): string =>
  emitYaml(ComponentSchema, component, EmitComponentError, (value) => ({
    id: value.id,
    nom: value.nom,
    type: value.type,
    zone: value.zone,
    responsabilite: value.responsabilite,
    possede: listIf(value.possede),
    sert: listIf(value.sert),
    acteurs: listIf(value.acteurs),
    depend_de: listIf(value.depend_de.map(dependency)),
    decisions: listIf(value.decisions),
    resume_client: value.resume_client === undefined ? undefined : [...value.resume_client],
  }));

type Item = ArchFlow["messages"][number];
type Message = Extract<Item, { de: string }>;

const message = (value: Message) => ({
  de: value.de,
  vers: value.vers,
  texte: value.texte,
  ...(value.retour === undefined ? {} : { retour: value.retour }),
  ...(value.erreur === undefined ? {} : { erreur: value.erreur }),
});

function item(value: Item): object {
  if (!("bloc" in value)) return message(value);
  if (value.bloc === "separateur") return { bloc: value.bloc, libelle: value.libelle };
  return { bloc: value.bloc, libelle: value.libelle, messages: value.messages.map(message) };
}

/** Flux technique -> YAML canonique (`architecture/flows/<P-id>.yaml`), ordre des messages conservé. Ne lève que `EmitArchFlowError`. */
export const emitArchFlowYaml = (flow: ArchFlow): string =>
  emitYaml(ArchFlowSchema, flow, EmitArchFlowError, (value) => ({
    id: value.id,
    participants: [...value.participants],
    messages: value.messages.map(item),
    fonctionnalites: listIf(value.fonctionnalites),
    regles: listIf(value.regles),
    decisions: listIf(value.decisions),
  }));
