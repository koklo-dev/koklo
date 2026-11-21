import { type DeliverableStatusValue, formatCount, type IconName } from "@koklo/ui";
import type { ArchitectureTab } from "./architecture-tab.ts";
import type { HeaderTabCount } from "./features-header-state.ts";
import type { FeaturesView } from "./features-view.ts";
import { shortDate } from "./overview-labels.ts";

/**
 * Actions de l'en-tête, dans l'ordre de la maquette 13 (l.859-866). `add` (« Ajouter », génération et relecture) et
 * `create` (« Nouveau composant », liste) ouvrent la même feuille ; l'agent reste le seul bouton primaire.
 */
export type ArchitectureHeaderAction =
  | "add"
  | "propose"
  | "propose-updates"
  | "repropose"
  | "create"
  | "create-flow"
  | "create-decision"
  | "validate";

export interface ArchitectureCounts {
  components: number;
  /** Flux (`flows.list`, total) : absent tant qu'il n'est pas lu (B548 : « N composants · N flux »). */
  flows?: number;
  /** Décisions (`adr.list`, total) : absent tant qu'il n'est pas lu (B591 : « N composants · N décisions · N flux »). */
  decisions?: number;
}

/** Dernière décision « validé » du livrable : prénom (équipe seulement), date et SHA de la version validée (B591). */
export interface ArchitectureValidation {
  name: string | null;
  at: string;
  sha: string | null;
}

export interface ArchitectureHeaderState {
  status?: DeliverableStatusValue;
  statusLabel?: string;
  statusIcon?: IconName;
  summary?: string;
  actions: ArchitectureHeaderAction[];
  tabCounts?: Partial<Record<ArchitectureTab, HeaderTabCount>>;
}

export interface ArchitectureHeaderInput {
  /** Équipe qui lit la spec : seule à voir le statut et le résumé. */
  team: boolean;
  /** Owner, admin, développeur : le designer lit et n'écrit pas (B510). */
  canWrite: boolean;
  /** « Proposer avec l'agent » disponible (rôle, spec lue, agent configuré). */
  agent: boolean;
  reviewing: boolean;
  /** Un lancement tourne et rien n'est encore arrivé à relire. */
  generating: boolean;
  pending: number;
  /** Composants proposés : comptés dans l'onglet Composants pendant la relecture. */
  proposedComponents?: number;
  viewKind: FeaturesView["kind"];
  tab: ArchitectureTab;
  counts: ArchitectureCounts | undefined;
  /** Statut du livrable (`spec.deliverables`). */
  deliverable: "todo" | "pending" | "revise" | "validated" | undefined;
  /** Décision « validé » en vigueur (`review.list`), pour « Validé par Moussa le 5 nov. · version 8f2d41c ». */
  validation?: ArchitectureValidation | undefined;
}

/** « Validé par Moussa le 5 nov. · version 8f2d41c » (maquette 13 l.862) ; sans prénom, « par l'équipe ». */
export function architectureValidationSummary(validation: ArchitectureValidation): string {
  const by = validation.name ? validation.name : "l'équipe";
  const version = validation.sha ? ` · version ${validation.sha.slice(0, 7)}` : "";
  return `Validé par ${by} le ${shortDate(validation.at)}${version}`;
}

const plural = (count: number, one: string, other: string): string =>
  `${formatCount(count)} ${count === 1 ? one : other}`;

/** « 34 composants · 23 décisions · 18 flux » (maquette 13 l.861, B591). */
export const architectureSummaryOf = (counts: ArchitectureCounts): string =>
  [
    plural(counts.components, "composant", "composants"),
    ...(counts.decisions === undefined ? [] : [plural(counts.decisions, "décision", "décisions")]),
    ...(counts.flows === undefined ? [] : [plural(counts.flows, "flux", "flux")]),
  ].join(" · ");

function tabCountsOf(input: ArchitectureHeaderInput): ArchitectureHeaderState["tabCounts"] {
  const { counts } = input;
  if (!counts) return undefined;
  const proposed = input.reviewing ? (input.proposedComponents ?? 0) : 0;
  const totals: ArchitectureHeaderState["tabCounts"] = {
    components: { value: counts.components + proposed },
    ...(counts.decisions === undefined ? {} : { decisions: { value: counts.decisions } }),
    ...(counts.flows === undefined ? {} : { flows: { value: counts.flows } }),
  };
  if (input.reviewing && !input.generating) {
    return { review: { value: input.pending, tone: "primary" }, ...totals };
  }
  return totals;
}

/** Résumé de l'état Liste : validation en vigueur (validé, à revoir) ou comptes. */
function listSummary(input: ArchitectureHeaderInput): string | undefined {
  const { deliverable, validation, counts } = input;
  if (deliverable === "validated" && validation) return architectureValidationSummary(validation);
  if (deliverable === "revise" && validation) {
    return `Validé le ${shortDate(validation.at)}, l'amont a changé depuis`;
  }
  return counts ? architectureSummaryOf(counts) : undefined;
}

const createActionOf = (tab: ArchitectureTab): ArchitectureHeaderAction[] =>
  tab === "document"
    ? []
    : [tab === "flows" ? "create-flow" : tab === "decisions" ? "create-decision" : "create"];

function listState(input: ArchitectureHeaderInput): ArchitectureHeaderState {
  const { deliverable } = input;
  const summary = listSummary(input);
  const settled = deliverable === "validated" || deliverable === "revise";
  return {
    status: settled ? deliverable : "in_progress",
    ...(deliverable === "validated" ? { statusLabel: "Validé par l'équipe" } : {}),
    ...(settled
      ? {}
      : {
          statusLabel: "Validation de l'équipe · le client lit et commente",
          statusIcon: "groups" as const,
        }),
    ...(summary ? { summary } : {}),
    // À revoir (maquette 13 l.864) : création puis « Proposer les mises à jour » en primaire ; Valider reste (B592 bis).
    actions:
      deliverable === "revise"
        ? [
            ...createActionOf(input.tab),
            ...(input.agent ? (["propose-updates"] as const) : []),
            "validate",
          ]
        : [
            ...(input.agent ? (["propose"] as const) : []),
            ...createActionOf(input.tab),
            ...(deliverable === "pending" ? (["validate"] as const) : []),
          ],
  };
}

function stateOf(input: ArchitectureHeaderInput): ArchitectureHeaderState {
  if (input.reviewing && input.agent) {
    if (input.generating) {
      return {
        status: "generating",
        summary: "Depuis le fonctionnel et les données",
        actions: ["add", "propose"],
      };
    }
    const tabCounts = tabCountsOf(input);
    return {
      status: "in_progress",
      summary: plural(input.pending, "proposition à relire", "propositions à relire"),
      actions: ["add", "repropose"],
      ...(tabCounts ? { tabCounts } : {}),
    };
  }
  const empty = input.viewKind === "empty" && (input.counts?.components ?? 0) === 0;
  if (empty && input.agent && input.canWrite) {
    return {
      status: "ready",
      summary: "Le fonctionnel et les données sont validés",
      actions: [],
    };
  }
  if (input.viewKind === "loading" || input.viewKind === "error") {
    return { actions: input.agent ? ["propose", "create"] : ["create"] };
  }
  const list = listState(input);
  const tabCounts = tabCountsOf(input);
  return tabCounts ? { ...list, tabCounts } : list;
}

/**
 * En-tête de l'écran Architecture par état (maquette 13 l.58-88, 859-866) : statut, résumé, actions et compteurs
 * d'onglet. Prêt n'a aucune action (l'état vide porte les deux) ; hors équipe, rien n'est dit ni proposé ; le designer
 * lit sans bouton d'écriture ; « Valider l'architecture » seulement tant que le livrable est à valider ou à revoir (B577).
 */
export function architectureHeaderStateOf(input: ArchitectureHeaderInput): ArchitectureHeaderState {
  if (!input.team) return { actions: [] };
  const state = stateOf(input);
  return input.canWrite ? state : { ...state, actions: [] };
}
