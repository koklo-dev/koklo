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

/** Actions de l'en-tête (maquette 14 l.774-815). */
export type TechnicalHeaderAction =
  | "add"
  | "propose"
  | "propose-updates"
  | "repropose"
  | "create-stack"
  | "create-operation"
  | "create-requirement"
  | "create-environment"
  | "validate";

export interface TechnicalHeaderState {
  status?: DeliverableStatusValue;
  statusLabel?: string;
  statusIcon?: IconName;
  summary?: string;
  actions: TechnicalHeaderAction[];
  /** « Valider » désactivé : un choix reste à trancher, ou les comptes ne sont pas encore lus. */
  validateBlocked?: true;
  /** Cahier validé : l'ajout devient le bouton principal. */
  createPrimary?: true;
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

/** Ajout de l'onglet ; aucun sur Document, la Relecture ajoute un choix. */
const CREATE: Record<TechnicalTab, TechnicalHeaderAction[]> = {
  review: ["create-stack"],
  stack: ["create-stack"],
  api: ["create-operation"],
  nfr: ["create-requirement"],
  environments: ["create-environment"],
  document: [],
};

function listActions(input: TechnicalHeaderInput): TechnicalHeaderAction[] {
  const create = CREATE[input.tab];
  if (!input.agent) return create;
  if (input.deliverable !== "revise") return ["propose", ...create];
  return input.available === false ? create : [...create, "propose-updates"];
}

/** « Valider » après les autres boutons, tant que le cahier est à valider ou à revoir (B775). */
function validationOf({ deliverable, counts }: TechnicalHeaderInput) {
  if (deliverable !== "pending" && deliverable !== "revise") return undefined;
  const blocked = counts === undefined || Boolean(counts.open);
  return blocked ? { validateBlocked: true as const } : {};
}

function tabCountsOf(input: TechnicalHeaderInput): TechnicalHeaderState["tabCounts"] {
  const { counts } = input;
  if (!counts) return undefined;
  const totals = {
    stack: { value: counts.choices },
    api: { value: counts.operations },
    nfr: { value: counts.requirements },
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
  const validation = validationOf(input);
  return {
    ...LIST_STATUS[settled ? deliverable : "open"],
    ...(summary ? { summary } : {}),
    actions: [...listActions(input), ...(validation ? ["validate" as const] : [])],
    ...validation,
    ...(deliverable === "validated" ? { createPrimary: true as const } : {}),
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
