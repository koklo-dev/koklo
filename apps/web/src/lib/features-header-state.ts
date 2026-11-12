import { type DeliverableStatusValue, formatCount } from "@koklo/ui";
import type { FeaturesView } from "./features-view.ts";

/** Actions de l'en-tête, dans l'ordre de la maquette 10 (l.637-658) ; `create` est l'action primaire, une seule. */
export type HeaderAction = "add" | "propose" | "repropose" | "create";

/** Compteur de l'onglet Fonctionnalités : le nombre, « … » en génération, « N à relire » (teinte `primary`) en relecture. */
export interface HeaderTabCount {
  value: number | string;
  tone?: "primary";
}

export interface HeaderState {
  status?: DeliverableStatusValue;
  /** Libellé long du statut (« À valider par le client · obligatoire »). */
  statusLabel?: string;
  summary?: string;
  actions: HeaderAction[];
  tabCount?: HeaderTabCount;
}

export interface HeaderInput {
  /** Équipe qui lit la spec : seule à voir le statut et le résumé. */
  team: boolean;
  canWrite: boolean;
  /** « Proposer avec l'agent » disponible (rôle, spec lue, agent configuré). */
  agent: boolean;
  reviewing: boolean;
  /** Un lancement de l'agent tourne et rien n'est encore arrivé à relire. */
  generating: boolean;
  /** Propositions à relire. */
  pending: number;
  viewKind: FeaturesView["kind"];
  /** Fonctionnalités du projet (`spec.head`), pas de la liste filtrée. */
  total: number | undefined;
  /** Statut du livrable (`spec.deliverables`) : celui de l'état Liste. */
  deliverable: "todo" | "pending" | "revise" | "validated" | undefined;
}

const plural = (count: number, one: string, other: string): string =>
  `${formatCount(count)} ${count === 1 ? one : other}`;

function reviewState({ generating, pending }: HeaderInput): HeaderState {
  if (generating) {
    return {
      status: "generating",
      summary: "Depuis le dossier d'idée figé",
      actions: ["add", "propose"],
      tabCount: { value: "…" },
    };
  }
  return {
    status: "in_progress",
    summary: plural(pending, "proposition à relire", "propositions à relire"),
    actions: ["add", "repropose"],
    tabCount: { value: `${pending} à relire`, tone: "primary" },
  };
}

function listState(input: HeaderInput): HeaderState {
  const { deliverable, total, viewKind } = input;
  const counted = viewKind === "list" || viewKind === "empty-filtered" || viewKind === "empty";
  return {
    ...(deliverable ? { status: deliverable === "todo" ? "in_progress" : deliverable } : {}),
    ...(deliverable === "pending" ? { statusLabel: "À valider par le client · obligatoire" } : {}),
    ...(total === undefined ? {} : { tabCount: { value: total } }),
    ...(counted && total ? { summary: plural(total, "fonctionnalité", "fonctionnalités") } : {}),
    actions: input.agent ? ["propose", "create"] : ["create"],
  };
}

/**
 * En-tête de l'écran Fonctionnel par état (maquette 10 l.637-658) : statut, résumé et actions. L'état Prêt n'a aucune
 * action (la carte de l'agent porte les deux) ; hors équipe, rien n'est dit ni proposé.
 */
export function headerStateOf(input: HeaderInput): HeaderState {
  if (!input.team) {
    return {
      actions: [],
      ...(input.total === undefined ? {} : { tabCount: { value: input.total } }),
    };
  }
  let state: HeaderState;
  if (input.reviewing && input.agent) state = reviewState(input);
  else if (input.viewKind === "empty" && input.agent && input.canWrite) {
    return {
      status: "ready",
      summary: "Rien encore · dossier d'idée figé disponible",
      actions: [],
    };
  } else if (input.viewKind === "loading" || input.viewKind === "error") {
    state = {
      actions: input.agent ? ["propose", "create"] : ["create"],
      ...(input.total === undefined ? {} : { tabCount: { value: input.total } }),
    };
  } else state = listState(input);
  return input.canWrite ? state : { ...state, actions: [] };
}
