import { type DeliverableStatusValue, formatCount, type IconName } from "@koklo/ui";
import {
  type ArchitectureValidation,
  architectureValidationSummary,
} from "./architecture-header-state.ts";
import type { HeaderTabCount } from "./features-header-state.ts";
import type { FeaturesView } from "./features-view.ts";
import { shortDate } from "./overview-labels.ts";
import type { SecurityTab } from "./security-tab.ts";

/** Actions de l'en-tête (maquette 15 l.654-659), hors le bouton partagé de l'agent. */
export type SecurityHeaderAction =
  | "propose"
  | "create-threat"
  | "add"
  | "repropose"
  | "propose-updates"
  | "validate";

export interface SecurityHeaderState {
  status?: DeliverableStatusValue;
  statusLabel?: string;
  statusIcon?: IconName;
  summary?: string;
  actions: SecurityHeaderAction[];
  /** « Valider » désactivé : un blocage reste, ou les comptes ne sont pas lus (B804). */
  validateBlocked?: true;
  tabCounts?: Partial<Record<SecurityTab, HeaderTabCount>>;
}

/** Comptes de la page (B813). */
export interface SecurityCounts {
  threats: number;
  /** Menaces avec au moins une parade. */
  treated: number;
  /** Menaces sans parade, toutes gravités. */
  todo: number;
  /** Menaces de gravité élevée sans parade : elles bloquent. */
  todoHigh: number;
  /** Lignes de la liste des données. */
  rows: number;
  /** Entrées enregistrées. */
  classified: number;
  /** Champs sans entrée et entrées sans durée : ils bloquent. */
  toDecide: number;
  scenarios: number;
  level: number;
  answered: number;
  total: number;
}

export interface SecurityHeaderInput {
  /** Équipe qui lit la spec : seule à voir le statut et le résumé. */
  team: boolean;
  /** Owner, admin, développeur : le designer lit sans écrire. */
  canWrite: boolean;
  agent: boolean;
  reviewing: boolean;
  /** Un lancement tourne et rien n'est encore arrivé à relire. */
  generating: boolean;
  pending: number;
  accepted: number;
  viewKind: FeaturesView["kind"];
  counts: SecurityCounts | undefined;
  deliverable: "todo" | "pending" | "revise" | "validated" | undefined;
  validation?: ArchitectureValidation | undefined;
  /** Livrable ouvert : sans quoi l'agent ne se relance pas (B755). */
  available?: boolean;
}

const plural = (count: number, one: string, other: string): string =>
  `${formatCount(count)} ${count >= 2 ? other : one}`;

/** « 1 menace élevée sans parade et 2 données à classer avant de valider » (maquette 15 l.653). */
function blockerText({ todoHigh, toDecide }: SecurityCounts): string | undefined {
  const parts = [
    todoHigh
      ? plural(todoHigh, "menace élevée sans parade", "menaces élevées sans parade")
      : undefined,
    toDecide ? plural(toDecide, "donnée à classer", "données à classer") : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(" et ")} avant de valider` : undefined;
}

function countsText(counts: SecurityCounts): string {
  return [
    plural(counts.threats, "menace", "menaces"),
    plural(counts.treated, "traitée", "traitées"),
    plural(counts.classified, "donnée classée", "données classées"),
    plural(counts.scenarios, "scénario d'abus", "scénarios d'abus"),
    `ASVS niveau ${counts.level}`,
    blockerText(counts),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** À revoir : la date, puis la raison quand « Valider » est désactivé (passation 21 §1). */
function reviseText({ at }: ArchitectureValidation, counts: SecurityCounts | undefined) {
  const dated = `Validé le ${shortDate(at)}, le cahier technique a changé depuis`;
  return [dated, counts && blockerText(counts)].filter(Boolean).join(" · ");
}

function listSummary({ deliverable, validation, counts }: SecurityHeaderInput) {
  if (deliverable === "validated" && validation) {
    return `${architectureValidationSummary(validation)} · le résumé rejoint la baseline 0`;
  }
  if (deliverable === "revise" && validation) {
    return reviseText(validation, counts);
  }
  return counts ? countsText(counts) : undefined;
}

function listActions(input: SecurityHeaderInput): SecurityHeaderAction[] {
  if (!input.agent) return ["create-threat"];
  if (input.deliverable !== "revise") return ["propose", "create-threat"];
  return input.available === false ? ["create-threat"] : ["create-threat", "propose-updates"];
}

/** « Valider » après les autres boutons, tant que la sécurité est à valider ou à revoir (B804). */
function validationOf({ deliverable, counts }: SecurityHeaderInput) {
  if (deliverable !== "pending" && deliverable !== "revise") return undefined;
  const blocked = counts === undefined || counts.todoHigh + counts.toDecide > 0;
  return blocked ? { validateBlocked: true as const } : {};
}

function tabCountsOf(input: SecurityHeaderInput): SecurityHeaderState["tabCounts"] {
  const { counts } = input;
  if (!counts) return undefined;
  const missing = counts.answered < counts.total;
  return {
    ...(input.reviewing ? { review: { value: input.pending, tone: "primary" as const } } : {}),
    threats: { value: counts.threats },
    data: { value: counts.rows },
    ...(missing ? { reqs: { value: `${counts.answered}/${counts.total}` } } : {}),
  };
}

const LIST_STATUS = {
  validated: { status: "validated", statusLabel: "Validé par l'équipe" },
  revise: { status: "revise" },
  open: {
    status: "in_progress",
    statusLabel: "Validation de l'équipe · le client lit le résumé",
    statusIcon: "groups",
  },
} as const;

function listState(input: SecurityHeaderInput): SecurityHeaderState {
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
    ...(tabCounts ? { tabCounts } : {}),
  };
}

function reviewState(input: SecurityHeaderInput): SecurityHeaderState {
  if (input.generating) {
    return { status: "generating", summary: "Depuis le technique", actions: ["add", "propose"] };
  }
  const tabCounts = tabCountsOf(input);
  const toRead = plural(input.pending, "proposition à relire", "propositions à relire");
  return {
    status: "in_progress",
    summary: `${toRead} · ${plural(input.accepted, "acceptée", "acceptées")}`,
    actions: ["add", "repropose"],
    ...(tabCounts ? { tabCounts } : {}),
  };
}

function stateOf(input: SecurityHeaderInput): SecurityHeaderState {
  if (input.reviewing && input.agent) return reviewState(input);
  if (input.viewKind === "empty" && input.agent && input.canWrite) {
    return { status: "ready", summary: "Le technique est validé", actions: [] };
  }
  if (input.viewKind === "loading" || input.viewKind === "error") {
    return { actions: listActions(input) };
  }
  return listState(input);
}

/** En-tête par état ; hors équipe, rien n'est dit ni proposé ; le designer lit sans bouton d'écriture. */
export function securityHeaderStateOf(input: SecurityHeaderInput): SecurityHeaderState {
  if (!input.team) return { actions: [] };
  const state = stateOf(input);
  if (input.canWrite) return state;
  const { validateBlocked: _, ...read } = state;
  return { ...read, actions: [] };
}
