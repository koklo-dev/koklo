import { type DeliverableStatusValue, formatCount } from "@koklo/ui";
import { FEATURES_TABS, type FeaturesTab } from "./features-tab.ts";
import type { FeaturesView } from "./features-view.ts";

/** Nombre d'éléments par onglet (`spec.head.counts`) ou de propositions à relire par onglet. */
export type TabNumbers = Record<FeaturesTab, number>;

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
  /** Compteur de l'onglet affiché. */
  tabCount?: HeaderTabCount;
  /** Compteur de chaque onglet (maquette 10 l.670) : total, « … » en génération, « N à relire » en relecture. */
  tabCounts?: Partial<Record<FeaturesTab, HeaderTabCount>>;
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
  /** Éléments de l'onglet affiché (`spec.head`), pas de la liste filtrée. */
  total: number | undefined;
  /** Onglet affiché ; les fonctionnalités par défaut. */
  tab?: FeaturesTab;
  /** Éléments de chaque onglet (`spec.head.counts`) : résumé et compteurs de la liste. */
  counts?: TabNumbers | undefined;
  /** Propositions à relire par onglet. */
  pendingByTab?: TabNumbers | undefined;
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

/** « 12 fonctionnalités · 300 règles · 3 rôles · 18 parcours » (maquette 10 l.637, sans « envoyé à »). */
function countsSummary(counts: TabNumbers): string {
  return [
    plural(counts.features, "fonctionnalité", "fonctionnalités"),
    plural(counts.rules, "règle", "règles"),
    plural(counts.roles, "rôle", "rôles"),
    plural(counts.flows, "parcours", "parcours"),
  ].join(" · ");
}

/** Nombres par onglet d'après `spec.head.counts` ; un compteur absent (index plus ancien) vaut 0. */
export function tabNumbers(counts: Partial<TabNumbers>): TabNumbers {
  return {
    features: counts.features ?? 0,
    rules: counts.rules ?? 0,
    roles: counts.roles ?? 0,
    flows: counts.flows ?? 0,
  };
}

const sumOf = (counts: TabNumbers): number => FEATURES_TABS.reduce((n, tab) => n + counts[tab], 0);

function summaryOf({ counts, total, viewKind }: HeaderInput): string | undefined {
  const counted = viewKind === "list" || viewKind === "empty-filtered" || viewKind === "empty";
  if (!counted) return undefined;
  if (counts) return sumOf(counts) > 0 ? countsSummary(counts) : undefined;
  return total ? plural(total, "fonctionnalité", "fonctionnalités") : undefined;
}

function listState(input: HeaderInput): HeaderState {
  const { deliverable, total } = input;
  const summary = summaryOf(input);
  return {
    ...(deliverable ? { status: deliverable === "todo" ? "in_progress" : deliverable } : {}),
    ...(deliverable === "pending" ? { statusLabel: "À valider par le client · obligatoire" } : {}),
    ...(total === undefined ? {} : { tabCount: { value: total } }),
    ...(summary ? { summary } : {}),
    actions: input.agent ? ["propose", "create"] : ["create"],
  };
}

/** Spec sans aucun élément : l'état Prêt (un onglet vide d'une spec qui n'est pas vide garde l'état Liste). */
const specIsEmpty = (input: HeaderInput): boolean =>
  input.viewKind === "empty" && (input.counts ? sumOf(input.counts) === 0 : true);

/** Compteur d'un onglet : « … » en génération, « N à relire » en relecture, sinon le total de l'onglet. */
function countOf(
  tab: FeaturesTab,
  input: HeaderInput,
  state: HeaderState,
): HeaderTabCount | undefined {
  if (state.status === "ready") return undefined;
  if (input.reviewing && input.agent && input.team && input.pendingByTab) {
    if (input.generating) return { value: "…" };
    const pending = input.pendingByTab[tab];
    return pending > 0 ? { value: `${pending} à relire`, tone: "primary" } : undefined;
  }
  if (tab === (input.tab ?? "features")) return state.tabCount;
  const total = input.counts?.[tab];
  return total === undefined ? undefined : { value: total };
}

function withTabCounts(input: HeaderInput, state: HeaderState): HeaderState {
  if (!input.counts) return state;
  const tabCounts: Partial<Record<FeaturesTab, HeaderTabCount>> = {};
  for (const tab of FEATURES_TABS) {
    const count = countOf(tab, input, state);
    if (count) tabCounts[tab] = count;
  }
  return { ...state, tabCounts };
}

function baseStateOf(input: HeaderInput): HeaderState {
  if (!input.team) {
    return {
      actions: [],
      ...(input.total === undefined ? {} : { tabCount: { value: input.total } }),
    };
  }
  let state: HeaderState;
  if (input.reviewing && input.agent) state = reviewState(input);
  else if (specIsEmpty(input) && input.agent && input.canWrite) {
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

/**
 * En-tête de l'écran Fonctionnel par état (maquette 10 l.637-658) : statut, résumé et actions. L'état Prêt n'a aucune
 * action (la carte de l'agent porte les deux) ; hors équipe, rien n'est dit ni proposé.
 */
export function headerStateOf(input: HeaderInput): HeaderState {
  return withTabCounts(input, baseStateOf(input));
}
