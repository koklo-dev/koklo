import { stringify } from "yaml";
import {
  type ArchFlow,
  ArchFlowSchema,
  type Component,
  ComponentSchema,
} from "../entities/index.ts";
import { toPointer } from "../parse/zod-issues.ts";
import { EmitError } from "./errors.ts";

export class EmitComponentError extends EmitError {
  constructor(message: string, path: string) {
    super("EmitComponentError", message, path);
  }
}

export class EmitArchFlowError extends EmitError {
  constructor(message: string, path: string) {
    super("EmitArchFlowError", message, path);
  }
}

/** Clé présente seulement si la liste n'est pas vide : un composant minimal reste lisible. */
const listIf = <K extends string, T>(key: K, items: readonly T[]): Partial<Record<K, T[]>> =>
  items.length === 0 ? {} : ({ [key]: [...items] } as Record<K, T[]>);

const dependency = (value: Component["depend_de"][number]) => ({
  vers: value.vers,
  via: value.via,
  ...(value.mode === undefined ? {} : { mode: value.mode }),
});

/**
 * Composant -> YAML canonique (`architecture/components/<slug>.yaml`) : clés dans un ordre FIXE, listes vides omises.
 * Pure ; ne lève que `EmitComponentError`. Relu par `parseSpecFiles`, l'émission est idempotente.
 */
export function emitComponentYaml(component: Component): string {
  const checked = ComponentSchema.safeParse(component);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitComponentError(
      issue?.message ?? "composant invalide",
      toPointer(issue?.path ?? []),
    );
  }
  const value = checked.data;
  return stringify(
    {
      id: value.id,
      nom: value.nom,
      type: value.type,
      zone: value.zone,
      responsabilite: value.responsabilite,
      ...listIf("possede", value.possede),
      ...listIf("sert", value.sert),
      ...listIf("depend_de", value.depend_de.map(dependency)),
      ...listIf("decisions", value.decisions),
      ...(value.resume_client === undefined ? {} : { resume_client: [...value.resume_client] }),
    },
    { lineWidth: 0 },
  );
}

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
export function emitArchFlowYaml(flow: ArchFlow): string {
  const checked = ArchFlowSchema.safeParse(flow);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new EmitArchFlowError(issue?.message ?? "flux invalide", toPointer(issue?.path ?? []));
  }
  const value = checked.data;
  return stringify(
    {
      id: value.id,
      participants: [...value.participants],
      messages: value.messages.map(item),
      ...listIf("fonctionnalites", value.fonctionnalites),
      ...listIf("regles", value.regles),
      ...listIf("decisions", value.decisions),
    },
    { lineWidth: 0 },
  );
}
