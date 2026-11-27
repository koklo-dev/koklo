import type { DeliverableStatusValue, IconName } from "@koklo/ui";
import {
  type ArchitectureValidation,
  architectureValidationSummary,
} from "./architecture-header-state.ts";
import type { HeaderTabCount } from "./features-header-state.ts";
import type { FeaturesView } from "./features-view.ts";
import { shortDate } from "./overview-labels.ts";
import { countsText, type TechnicalCounts } from "./technical-labels.ts";
import type { TechnicalTab } from "./technical-tab.ts";

/** Actions de l'en-tête (maquette 14 l.774-815). Pas de « Valider » avant TK-116. */
export type TechnicalHeaderAction =
  | "add"
  | "propose"
  | "propose-updates"
  | "repropose"
  | "create-stack"
  | "create-environment";

export interface TechnicalHeaderState {
  status?: DeliverableStatusValue;
  statusLabel?: string;
  statusIcon?: IconName;
  summary?: string;
  actions: TechnicalHeaderAction[];
  tabCounts?: Partial<Record<TechnicalTab, HeaderTabCount>>;
}

export interface TechnicalHeaderInput {
  /** Équipe qui lit la spec : seule à voir le statut et le résumé. */
  team: boolean;
  /** Owner, admin, développeur : le designer lit sans écrire. */
  canWrite: boolean;
  agent: boolean;
  reviewing: boolean;
  /** Un lancement tourne et rien n'est encore arrivé à relire. */
  generating: boolean;
  pending: number;
  viewKind: FeaturesView["kind"];
  tab: TechnicalTab;
  /** Comptes de la tête et choix à trancher ; absents tant qu'ils ne sont pas lus. */
  counts: (TechnicalCounts & { open?: number }) | undefined;
  deliverable: "todo" | "pending" | "revise" | "validated" | undefined;
  validation?: ArchitectureValidation | undefined;
  /** Livrable ouvert : sans quoi l'agent ne se relance pas (B745). */
  available?: boolean;
}

const plural = (count: number, one: string, other: string): string =>
  `${count} ${count === 1 ? one : other}`;

/** « … · 2 choix à trancher avant de valider » (maquette 14 l.776). */
function openSummary(counts: NonNullable<TechnicalHeaderInput["counts"]>): string {
  const open = counts.open ? ` · ${counts.open} choix à trancher avant de valider` : "";
  return `${countsText(counts)}${open}`;
}

function listSummary({ deliverable, validation, counts }: TechnicalHeaderInput) {
  if (deliverable === "validated" && validation) return architectureValidationSummary(validation);
  if (deliverable === "revise" && validation) {
    return `Validé le ${shortDate(validation.at)}, l'architecture a changé depuis`;
  }
  return counts ? openSummary(counts) : undefined;
}

const createActionOf = (tab: TechnicalTab): TechnicalHeaderAction[] => {
  if (tab === "document") return [];
  return [tab === "environments" ? "create-environment" : "create-stack"];
};

function listActions(input: TechnicalHeaderInput): TechnicalHeaderAction[] {
  const create = createActionOf(input.tab);
  if (!input.agent) return create;
  if (input.deliverable !== "revise") return ["propose", ...create];
  return input.available === false ? create : [...create, "propose-updates"];
}

function tabCountsOf(input: TechnicalHeaderInput): TechnicalHeaderState["tabCounts"] {
  const { counts } = input;
  if (!counts) return undefined;
  const totals = {
    stack: { value: counts.choices },
    environments: { value: counts.environments },
  };
  if (!input.reviewing) return totals;
  return { review: { value: input.pending, tone: "primary" as const }, ...totals };
}

const LIST_STATUS = {
  validated: { status: "validated", statusLabel: "Validé par l'équipe" },
  revise: { status: "revise" },
  open: {
    status: "in_progress",
    statusLabel: "Validation de l'équipe · le client lit et commente",
    statusIcon: "groups",
  },
} as const;

function listState(input: TechnicalHeaderInput): TechnicalHeaderState {
  const { deliverable } = input;
  const settled = deliverable === "validated" || deliverable === "revise";
  const summary = listSummary(input);
  const tabCounts = tabCountsOf(input);
  return {
    ...LIST_STATUS[settled ? deliverable : "open"],
    ...(summary ? { summary } : {}),
    actions: listActions(input),
    ...(tabCounts ? { tabCounts } : {}),
  };
}

function reviewState(input: TechnicalHeaderInput): TechnicalHeaderState {
  if (input.generating) {
    return { status: "generating", summary: "Depuis l'architecture", actions: ["add", "propose"] };
  }
  const tabCounts = tabCountsOf(input);
  return {
    status: "in_progress",
    summary: plural(input.pending, "proposition à relire", "propositions à relire"),
    actions: ["add", "repropose"],
    ...(tabCounts ? { tabCounts } : {}),
  };
}

function stateOf(input: TechnicalHeaderInput): TechnicalHeaderState {
  if (input.reviewing && input.agent) return reviewState(input);
  if (input.viewKind === "empty" && input.agent && input.canWrite) {
    return { status: "ready", summary: "L'architecture est validée", actions: [] };
  }
  if (input.viewKind === "loading" || input.viewKind === "error") {
    return { actions: listActions(input) };
  }
  return listState(input);
}

/** En-tête par état ; hors équipe, rien n'est dit ni proposé ; le designer lit sans bouton d'écriture. */
export function technicalHeaderStateOf(input: TechnicalHeaderInput): TechnicalHeaderState {
  if (!input.team) return { actions: [] };
  const state = stateOf(input);
  return input.canWrite ? state : { ...state, actions: [] };
}
