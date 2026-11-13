import { type DeliverableStatusValue, formatCount, type IconName } from "@koklo/ui";
import { DATA_TABS, type DataTab } from "./data-tab.ts";
import type { HeaderTabCount } from "./features-header-state.ts";
import type { FeaturesView } from "./features-view.ts";

/** Actions de l'en-tête, dans l'ordre de la maquette 11 (l.598) ; `create` (Ajouter une table) est en contour comme `add`, AgentProposeButton reste le seul primaire (B409). */
export type DataHeaderAction = "add" | "propose" | "repropose" | "create";

export interface DataCounts {
  tables: number;
  relations: number;
  fixtures: number;
}

export interface DataHeaderState {
  status?: DeliverableStatusValue;
  statusLabel?: string;
  statusIcon?: IconName;
  summary?: string;
  actions: DataHeaderAction[];
  tabCounts?: Partial<Record<DataTab, HeaderTabCount>>;
}

export interface DataHeaderInput {
  /** Équipe qui lit la spec : seule à voir le statut et le résumé. */
  team: boolean;
  /** Owner, admin, développeur : le designer lit et n'écrit pas (B389). */
  canWrite: boolean;
  /** « Proposer avec l'agent » disponible (rôle, spec lue, agent configuré). */
  agent: boolean;
  reviewing: boolean;
  /** Un lancement tourne et rien n'est encore arrivé à relire. */
  generating: boolean;
  pending: number;
  /** Tables et jeux proposés à relire : comptés dans les onglets Tables et Jeux d'exemple pendant la relecture (maquette 11 l.536). */
  proposedTables?: number;
  proposedFixtures?: number;
  viewKind: FeaturesView["kind"];
  tab: DataTab;
  counts: DataCounts | undefined;
  /** Statut du livrable (`spec.deliverables`). */
  deliverable: "todo" | "pending" | "revise" | "validated" | undefined;
}

const plural = (count: number, one: string, other: string): string =>
  `${formatCount(count)} ${count === 1 ? one : other}`;

/** « 6 tables · 6 relations · 2 jeux d'exemple » (maquette 11 l.598). */
export function dataSummaryOf(counts: DataCounts): string {
  return [
    plural(counts.tables, "table", "tables"),
    plural(counts.relations, "relation", "relations"),
    plural(counts.fixtures, "jeu d'exemple", "jeux d'exemple"),
  ].join(" · ");
}

function tabCountsOf(input: DataHeaderInput): DataHeaderState["tabCounts"] {
  const { counts } = input;
  if (!counts) return undefined;
  const totals: Partial<Record<DataTab, HeaderTabCount>> = {
    tables: { value: counts.tables + (input.reviewing ? (input.proposedTables ?? 0) : 0) },
    fixtures: { value: counts.fixtures + (input.reviewing ? (input.proposedFixtures ?? 0) : 0) },
  };
  if (input.reviewing && !input.generating) {
    totals.review = { value: input.pending, tone: "primary" };
  }
  return Object.fromEntries(DATA_TABS.flatMap((tab) => (totals[tab] ? [[tab, totals[tab]]] : [])));
}

function listState(input: DataHeaderInput): DataHeaderState {
  const { deliverable, counts } = input;
  const settled = deliverable === "validated" || deliverable === "revise";
  return {
    status: settled ? deliverable : "in_progress",
    ...(settled
      ? {}
      : {
          statusLabel: "Validation de l'équipe · le client lit et commente",
          statusIcon: "groups" as const,
        }),
    ...(counts ? { summary: dataSummaryOf(counts) } : {}),
    actions: input.agent ? ["propose", "create"] : ["create"],
  };
}

function stateOf(input: DataHeaderInput): DataHeaderState {
  if (input.reviewing && input.agent) {
    if (input.generating) {
      return {
        status: "generating",
        summary: "Depuis le cahier fonctionnel",
        actions: ["add", "propose"],
      };
    }
    return {
      status: "in_progress",
      summary: plural(input.pending, "proposition à relire", "propositions à relire"),
      actions: ["add", "repropose"],
      tabCounts: tabCountsOf(input),
    };
  }
  const empty = input.viewKind === "empty" && (input.counts?.tables ?? 0) === 0;
  if (empty && input.agent && input.canWrite) {
    return { status: "ready", summary: "Le cahier fonctionnel est enregistré", actions: [] };
  }
  if (input.viewKind === "loading" || input.viewKind === "error") {
    return { actions: input.agent ? ["propose", "create"] : ["create"] };
  }
  const list = listState(input);
  const tabCounts = tabCountsOf(input);
  return tabCounts ? { ...list, tabCounts } : list;
}

/**
 * En-tête de l'écran Données par état (maquette 11 l.588-598) : statut, résumé, actions et compteurs d'onglet. L'état
 * Prêt n'a aucune action (la carte de l'agent porte les deux) ; hors équipe, rien n'est dit ni proposé ; le designer
 * lit sans bouton d'écriture ; jamais de « Valider le modèle » (B390).
 */
export function dataHeaderStateOf(input: DataHeaderInput): DataHeaderState {
  if (!input.team) return { actions: [] };
  const state = stateOf(input);
  return input.canWrite ? state : { ...state, actions: [] };
}
