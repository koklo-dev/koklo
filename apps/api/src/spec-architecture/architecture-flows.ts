import type { ArchflowDetail, ArchitectureFlowSummary } from "@koklo/contract";
import { type ArchFlow, ArchFlowSchema, type Component, ComponentSchema } from "@koklo/schema";
import { isRecord, list, text, texts } from "../spec-read/entity-values.ts";
import { componentNode } from "./architecture-values.ts";

/**
 * Flux d'architecture (TK-112, B543) : résumé d'une ligne de liste, détail d'un flux, relecture de l'index pour produire le YAML
 * et le Mermaid. Lecture tolérante de `spec_entities.data` (ce que le worker écrit depuis `architecture/flows/<P-id>.yaml`, plus
 * `titre`) : un champ absent ou d'un autre type reprend sa valeur neutre, jamais une exception.
 */
type Json = Record<string, unknown>;
type Item = ArchflowDetail["items"][number];
type Message = Extract<Item, { kind: "message" }>;

const FEATURE = /^F-\d{3,}$/;
const RULE = /^R-\d{3,}$/;
const ADR = /^ADR-\d{3,}$/;
const PARTICIPANT = /^(C|RL)-[a-z0-9][a-z0-9-]*$/;
const COMPONENT_TYPES = ["app", "service", "store", "queue", "ext"] as const;

/** Composants et rôles connus de l'index : de quoi nommer et typer les participants. */
export interface KnownParticipants {
  components: ReadonlyMap<string, { name: string; type: string }>;
  roles: ReadonlyMap<string, string>;
}

/** Nom des rôles `RL-` de l'entité `roles` (`domain/roles.yaml`) ; données illisibles : aucune entrée. */
export function roleNamesOf(data: unknown): Map<string, string> {
  const names = new Map<string, string>();
  for (const entry of list(isRecord(data) ? data.roles : undefined)) {
    const role = isRecord(entry) ? entry : {};
    const id = text(role.id);
    const name = text(role.nom);
    if (id.startsWith("RL-") && name !== "") names.set(id, name);
  }
  return names;
}

/** Composants (nom, type) et rôles de l'index : de quoi nommer et typer les participants d'un flux. */
export function knownParticipants(
  components: readonly { specId: string; data: unknown }[],
  roles: unknown,
): KnownParticipants {
  return {
    components: new Map(
      components.map(({ specId, data }) => {
        const node = componentNode(specId, data);
        return [specId, { name: node.name, type: node.type }];
      }),
    ),
    roles: roleNamesOf(roles),
  };
}

const record = (value: unknown): Json => (isRecord(value) ? value : {});
const matching = (value: unknown, pattern: RegExp): string[] =>
  texts(value).filter((id) => pattern.test(id));
const participantsOf = (data: Json): string[] => matching(data.participants, PARTICIPANT);
const isActor = (id: string): boolean => id.startsWith("RL-");

/** Parcours métier `P-` du même identifiant : titre et acteur, `undefined` s'il n'existe pas. */
export interface Parcours {
  titre?: unknown;
  acteur?: unknown;
}

const titleOf = (specId: string, parcours: Parcours | undefined): string =>
  text(parcours?.titre) || specId;

function actorOf(parcours: Parcours | undefined, participants: string[], known: KnownParticipants) {
  const named = text(parcours?.acteur);
  if (named !== "") return named;
  const role = participants.find(isActor);
  return role === undefined ? "" : (known.roles.get(role) ?? role);
}

/** Ligne de la liste des flux : titre et acteur du parcours, composants et externes parmi les participants. */
export function flowSummary(
  specId: string,
  data: unknown,
  parcours: Parcours | undefined,
  known: KnownParticipants,
): ArchitectureFlowSummary {
  const participants = participantsOf(record(data));
  const components = participants.filter((id) => !isActor(id));
  return {
    specId,
    title: titleOf(specId, parcours),
    actor: actorOf(parcours, participants, known),
    componentCount: components.length,
    externalCount: components.filter((id) => known.components.get(id)?.type === "ext").length,
  };
}

function participantType(
  id: string,
  known: KnownParticipants,
): ArchflowDetail["participants"][number]["type"] {
  if (isActor(id)) return "actor";
  const type = known.components.get(id)?.type;
  return COMPONENT_TYPES.find((value) => value === type) ?? "app";
}

function messageOf(value: unknown): Omit<Message, "kind"> | undefined {
  const json = record(value);
  const from = text(json.de);
  const to = text(json.vers);
  const body = text(json.texte);
  if (!PARTICIPANT.test(from) || !PARTICIPANT.test(to) || body === "") return undefined;
  const reply = text(json.retour);
  const error = text(json.erreur);
  return {
    from,
    to,
    text: body,
    ...(reply === "" ? {} : { reply }),
    ...(error === "" ? {} : { error }),
  };
}

function itemOf(value: unknown): Item | undefined {
  const json = record(value);
  if (json.bloc === "separateur") {
    const label = text(json.libelle);
    return label === "" ? undefined : { kind: "separator", label };
  }
  if (json.bloc === "alt") {
    const label = text(json.libelle);
    const messages = list(json.messages).flatMap((entry) => messageOf(entry) ?? []);
    return label === "" || messages.length === 0 ? undefined : { kind: "alt", label, messages };
  }
  const message = messageOf(value);
  return message === undefined ? undefined : { kind: "message", ...message };
}

/** Détail d'un flux : participants nommés et typés, éléments dans l'ordre du fichier, liens, fichier et commit lus. */
export function flowDetail(
  specId: string,
  data: unknown,
  parcours: Parcours | undefined,
  known: KnownParticipants,
  where: { filePath: string; commitSha: string },
): ArchflowDetail {
  const json = record(data);
  const participants = participantsOf(json);
  return {
    specId,
    title: titleOf(specId, parcours),
    actor: actorOf(parcours, participants, known),
    participants: participants.map((id) => ({
      id,
      name: isActor(id) ? (known.roles.get(id) ?? id) : (known.components.get(id)?.name ?? id),
      type: participantType(id, known),
    })),
    items: list(json.messages).flatMap((entry) => itemOf(entry) ?? []),
    features: matching(json.fonctionnalites, FEATURE),
    rules: matching(json.regles, RULE),
    decisions: matching(json.decisions, ADR),
    filePath: where.filePath,
    commitSha: where.commitSha,
  };
}

/** Sans le `titre` ajouté par l'index. */
const withoutTitle = (data: unknown): unknown => {
  const { titre: _titre, ...rest } = record(data);
  return rest;
};

/** Flux de l'index relu au schéma pour être émis en YAML ou en Mermaid ; contenu illisible : `undefined`. */
export function archFlowOf(data: unknown): ArchFlow | undefined {
  const parsed = ArchFlowSchema.safeParse(withoutTitle(data));
  return parsed.success ? parsed.data : undefined;
}

/** Composant de l'index relu au schéma ; contenu illisible : `undefined`. */
export function componentOf(data: unknown): Component | undefined {
  const parsed = ComponentSchema.safeParse(withoutTitle(data));
  return parsed.success ? parsed.data : undefined;
}
