import type { SpecItem, SpecOperation } from "@koklo/contract";
import type { FormIssue } from "./feature-form.ts";

/**
 * Formulaire Flux (TK-112, B545) : un flux technique détaille un parcours `P-` ; il se saisit à la main (aucun
 * préremplissage par l'agent). Les étapes s'écrivent une par ligne :
 * `C-portail -> C-api : texte | retour: ok | erreur: refus`, `alt: libellé` … `fin` pour un bloc, `--- libellé` pour
 * un séparateur. Valeurs saisies, contrôle et opérations `archflow.create|update` de `specBatch.submit`.
 */
type Detail = Extract<SpecItem, { type: "archflow" }>["values"];
type Item = Detail["items"][number];
type Message = Extract<Item, { kind: "message" }>;
type Operation = SpecOperation;
type FlowItem =
  | { from: string; to: string; text: string; reply?: string; error?: string }
  | { block: "alt"; label: string; messages: FlowMessage[] }
  | { block: "separator"; label: string };
type FlowMessage = Extract<FlowItem, { from: string }>;

export interface FlowValues {
  /** Parcours détaillé (`P-…`) : fixé à la création, c'est l'identifiant du flux. */
  flow: string;
  /** Participants (`C-…` ou `RL-…`), de gauche à droite dans le diagramme. */
  participants: string[];
  steps: string;
  features: string[];
  rules: string[];
  decisions: string[];
}

export const EMPTY_FLOW: FlowValues = {
  flow: "",
  participants: [],
  steps: "",
  features: [],
  rules: [],
  decisions: [],
};

const REQUIRED = "Ce champ est obligatoire.";
const FLOW = /^P-[a-z0-9][a-z0-9-]*$/;
const PARTICIPANT = /^(C|RL)-[a-z0-9][a-z0-9-]*$/;
const FEATURE = /^F-\d{3,}$/;
const RULE = /^R-\d{3,}$/;
const DECISION = /^ADR-\d{3,}$/;
const MESSAGE = /^(\S+)\s*->\s*(\S+)\s*:\s*(.+)$/;
const TEXT_MAX = 300;
const LABEL_MAX = 200;
const STEPS_MAX = 60;
const PARTICIPANTS = { min: 2, max: 12 };

export const flowTag = (tag: string): string | null =>
  PARTICIPANT.test(tag) ? null : `« ${tag} » n'est pas un composant ni un rôle (C-api, RL-client).`;
export const featureTag = (tag: string): string | null =>
  FEATURE.test(tag) ? null : `« ${tag} » n'est pas une fonctionnalité (exemple : F-001).`;
export const ruleTag = (tag: string): string | null =>
  RULE.test(tag) ? null : `« ${tag} » n'est pas une règle (exemple : R-001).`;
export const decisionTag = (tag: string): string | null =>
  DECISION.test(tag) ? null : `« ${tag} » n'est pas une décision (exemple : ADR-001).`;

const messageLine = (message: Message | FlowMessage, indent: string): string => {
  const from = "from" in message ? message.from : "";
  const parts = [`${indent}${from} -> ${message.to} : ${message.text}`];
  if (message.reply !== undefined) parts.push(`retour: ${message.reply}`);
  if (message.error !== undefined) parts.push(`erreur: ${message.error}`);
  return parts.join(" | ");
};

/** Étapes d'un flux lu, en texte éditable (une ligne par message, `alt:` … `fin`, `--- séparateur`). */
export function stepsTextOf(items: readonly Item[]): string {
  return items
    .flatMap((item) => {
      if (item.kind === "message") return [messageLine(item, "")];
      if (item.kind === "separator") return [`--- ${item.label}`];
      return [
        `alt: ${item.label}`,
        ...item.messages.map((message) => messageLine(message, "  ")),
        "fin",
      ];
    })
    .join("\n");
}

type Parsed = { items: FlowItem[] } | { line: number; message: string };

function parseMessage(text: string): FlowMessage | null {
  const [head = "", ...extras] = text.split(/\s+\|\s+/);
  const match = MESSAGE.exec(head.trim());
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const message: FlowMessage = { from: match[1], to: match[2], text: match[3].trim() };
  for (const extra of extras) {
    const reply = /^retour:\s*(.+)$/.exec(extra.trim());
    const error = /^erreur:\s*(.+)$/.exec(extra.trim());
    if (reply?.[1]) message.reply = reply[1].trim();
    else if (error?.[1]) message.error = error[1].trim();
    else return null;
  }
  return message;
}

type Alt = Extract<FlowItem, { block: "alt" }>;
/** État de la lecture : éléments déjà lus et bloc `alt` ouvert, s'il y en a un. */
interface Reading {
  items: FlowItem[];
  block: Alt | null;
}

const bad = (line: number, message: string): Parsed => ({ line, message });

/** « fin » : ferme le bloc `alt` ouvert, qui contient au moins un message. */
function closeBlock(at: number, state: Reading): Parsed | null {
  if (!state.block) return bad(at, "« fin » ferme un bloc « alt: » qui n'est pas ouvert.");
  if (state.block.messages.length === 0) {
    return bad(at, "Un bloc « alt: » contient au moins un message.");
  }
  state.block = null;
  return null;
}

/** `--- libellé` (séparateur) ou `alt: libellé` (ouvre un bloc) : hors d'un bloc, avec un libellé. */
function openItem(line: string, at: number, state: Reading): Parsed | null {
  const separator = line.startsWith("---");
  const label = line.slice(separator ? 3 : 4).trim();
  if (state.block || !label) {
    return bad(
      at,
      separator
        ? "Un séparateur s'écrit « --- libellé », hors d'un bloc."
        : "Un bloc s'écrit « alt: libellé », sans bloc dans un bloc.",
    );
  }
  const item: Alt | Extract<FlowItem, { block: "separator" }> = separator
    ? { block: "separator", label }
    : { block: "alt", label, messages: [] };
  state.items.push(item);
  if (item.block === "alt") state.block = item;
  return null;
}

/** Lit une ligne dans l'état donné : `null` si elle est correcte, sinon ce qu'il faut corriger. */
function readLine(line: string, at: number, state: Reading): Parsed | null {
  if (line === "fin") return closeBlock(at, state);
  if (line.startsWith("---") || line.startsWith("alt:")) return openItem(line, at, state);
  const message = parseMessage(line);
  if (!message) {
    return bad(at, "Une étape s'écrit « C-a -> C-b : texte », puis | retour: ou | erreur:.");
  }
  (state.block?.messages ?? state.items).push(message);
  return null;
}

/** Lit les étapes saisies : les éléments du flux, ou la première ligne à corriger (numérotée à partir de 1). */
export function parseSteps(text: string): Parsed {
  const state: Reading = { items: [], block: null };
  const lines = text.split("\n");
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    const failed = line === "" ? null : readLine(line, index + 1, state);
    if (failed) return failed;
  }
  if (state.block) return bad(lines.length, "Le bloc « alt: » n'est pas fermé par « fin ».");
  return { items: state.items };
}

export function flowValuesOf(detail: Detail): FlowValues {
  return {
    flow: detail.specId,
    participants: detail.participants.map((participant) => participant.id),
    steps: stepsTextOf(detail.items),
    features: [...detail.features],
    rules: [...detail.rules],
    decisions: [...detail.decisions],
  };
}

const issue = (field: string, message = REQUIRED): FormIssue => ({ field, message });
const tagsIssue = (field: string, tags: readonly string[], pattern: RegExp, hint: string) =>
  tags.some((tag) => !pattern.test(tag)) ? [issue(field, hint)] : [];

function messagesOf(items: readonly FlowItem[]): FlowMessage[] {
  return items.flatMap((item) =>
    "block" in item ? (item.block === "alt" ? item.messages : []) : [item],
  );
}

function stepsIssues(values: FlowValues): FormIssue[] {
  if (values.steps.trim() === "") return [issue("steps")];
  const parsed = parseSteps(values.steps);
  if ("line" in parsed) return [issue("steps", `Ligne ${parsed.line} : ${parsed.message}`)];
  if (parsed.items.length > STEPS_MAX) return [issue("steps", `Au plus ${STEPS_MAX} étapes.`)];
  const known = new Set(values.participants);
  const unknown = messagesOf(parsed.items).find(
    (message) => !known.has(message.from) || !known.has(message.to),
  );
  const tooLong = messagesOf(parsed.items).some((message) =>
    [message.text, message.reply ?? "", message.error ?? ""].some((text) => text.length > TEXT_MAX),
  );
  const label = parsed.items.some((item) => "block" in item && item.label.length > LABEL_MAX);
  if (unknown) {
    const name = known.has(unknown.from) ? unknown.to : unknown.from;
    return [issue("steps", `« ${name} » n'est pas dans les participants.`)];
  }
  return tooLong || label ? [issue("steps", `Au plus ${TEXT_MAX} caractères par message.`)] : [];
}

/** Points à corriger, dans l'ordre du formulaire : parcours, participants, étapes, puis les liens. */
export function flowIssues(values: FlowValues, mode: "create" | "edit" = "create"): FormIssue[] {
  const count = values.participants.length;
  return [
    ...(mode === "create" && !FLOW.test(values.flow)
      ? [issue("flow", "Un parcours (P-reserver) : le flux porte son identifiant.")]
      : []),
    ...(count < PARTICIPANTS.min || count > PARTICIPANTS.max
      ? [issue("participants", `Entre ${PARTICIPANTS.min} et ${PARTICIPANTS.max} participants.`)]
      : tagsIssue(
          "participants",
          values.participants,
          PARTICIPANT,
          "Un composant (C-api) ou un rôle (RL-client) par puce.",
        )),
    ...stepsIssues(values),
    ...tagsIssue("features", values.features, FEATURE, "Une fonctionnalité (F-001) par puce."),
    ...tagsIssue("rules", values.rules, RULE, "Une règle (R-001) par puce."),
    ...tagsIssue("decisions", values.decisions, DECISION, "Une décision (ADR-001) par puce."),
  ];
}

function fieldsOf(values: FlowValues) {
  const parsed = parseSteps(values.steps);
  return {
    participants: values.participants,
    messages: "items" in parsed ? parsed.items : [],
    features: values.features,
    rules: values.rules,
    decisions: values.decisions,
  };
}

/** Création (listes vides omises) ou, avec `edit`, modification des seuls champs changés. */
export function flowOperationOf(
  values: FlowValues,
  edit?: { specId: string; baseline: FlowValues },
): Operation | null {
  const next = fieldsOf(values);
  if (!edit) {
    return {
      kind: "archflow.create",
      flow: values.flow,
      participants: next.participants,
      messages: next.messages,
      ...(next.features.length > 0 ? { features: next.features } : {}),
      ...(next.rules.length > 0 ? { rules: next.rules } : {}),
      ...(next.decisions.length > 0 ? { decisions: next.decisions } : {}),
    } as Operation;
  }
  const before = fieldsOf(edit.baseline);
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(before[key]),
  );
  if (changed.length === 0) return null;
  return {
    kind: "archflow.update",
    specId: edit.specId,
    ...Object.fromEntries(changed.map((key) => [key, next[key]])),
  } as Operation;
}
