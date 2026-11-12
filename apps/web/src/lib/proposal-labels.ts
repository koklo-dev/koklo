import { priorityLabel } from "./feature-labels.ts";
import { FEATURES_TABS, tabOfProposalKind } from "./features-tab.ts";
import type { ProposalOutput } from "./proposal-types.ts";

/** Livrable branché par TK-99b : le cahier fonctionnel (les six autres suivent TK-100). */
export const DELIVERABLE = "functional" as const;

/** Textes des choix de la modale, par mode serveur (maquette 21 : « Ce que l'agent va faire »). */
export const MODE_TEXTS: Record<
  string,
  { title: string; description: string; noun?: [string, string] }
> = {
  complete: {
    title: "Compléter le cahier",
    description:
      "Les fonctionnalités que le dossier d'idée annonce et que le cahier n'a pas encore.",
  },
  criteria: {
    title: "Écrire les critères manquants",
    description: "Des critères d'acceptation pour chaque fonctionnalité qui n'en a pas.",
    noun: ["critère", "critères"],
  },
  update: {
    title: "Mettre à jour depuis le dossier",
    description: "Les pages de l'idée modifiées depuis la dernière génération.",
    noun: ["page", "pages"],
  },
  all: {
    title: "Tout reproposer",
    description: "Fonctionnalités et critères, en une seule relecture.",
  },
};

export const KIND_LABELS: Record<string, string> = {
  feature: "Fonctionnalité",
  criteria: "Critères",
  rule: "Règle",
  role: "Rôle",
  flow: "Parcours",
};

export const UNAVAILABLE_REASONS: Record<string, string> = {
  no_frozen_idea:
    "Figez d'abord une version du dossier d'idée : l'agent ne lit que le dossier figé.",
  not_wired: "L'agent ne propose pas encore ce livrable.",
  not_configured: "L'IA n'est pas configurée pour votre organisation.",
};

export const NO_ACCESS = "Vous n'avez pas accès à cette action.";
export const ADDED_TEXT = (added: number, total: number): string =>
  `${added} ${added >= 2 ? "propositions de plus arrivées" : "proposition de plus arrivée"} · ${total} au total`;
export const ARRIVED_TEXT = (total: number): string =>
  `${total} ${total >= 2 ? "propositions arrivées" : "proposition arrivée"}`;
export const GROUP_CHANGED_TEXT = (pending: number): string =>
  `Le groupe a changé : ${pending} à relire.`;
export const SAVED_TEXT = (saved: number, left: number): string =>
  left === 0
    ? `${saved} enregistrée${saved >= 2 ? "s" : ""} dans la spec`
    : `${saved} enregistrée${saved >= 2 ? "s" : ""}, ${left} à reprendre`;
export const BLOCKED_TEXT = "Enregistrement échoué · à reprendre par l'équipe technique";

const TAB_NOUNS = {
  features: ["fonctionnalité", "fonctionnalités"],
  rules: ["règle", "règles"],
  roles: ["rôle", "rôles"],
  flows: ["parcours", "parcours"],
} as const;

/**
 * Récapitulatif d'un enregistrement groupé par onglet : « 3 fonctionnalités, 2 règles ». Vide quand tout vient d'un
 * seul onglet (le décompte seul suffit).
 */
export function savedBreakdown(kinds: readonly string[]): string {
  const counts = FEATURES_TABS.map((tab) => ({
    tab,
    n: kinds.filter((kind) => tabOfProposalKind(kind) === tab).length,
  })).filter((entry) => entry.n > 0);
  if (counts.length < 2) return "";
  return counts
    .map(({ tab, n }) => `${n} ${n >= 2 ? TAB_NOUNS[tab][1] : TAB_NOUNS[tab][0]}`)
    .join(", ");
}

const countLabel = (n: number, [one, other]: [string, string]): string =>
  `${n} ${n >= 2 ? other : one}`;
export const optionCountLabel = (mode: string, count: number | undefined): string | undefined => {
  const noun = MODE_TEXTS[mode]?.noun;
  return count !== undefined && noun ? countLabel(count, noun) : undefined;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Préfixe du rang quand la proposition n'a pas d'identifiant : un rôle ne prend jamais `P-` (parcours). */
const RANK_PREFIX: Record<string, string> = { rule: "R", role: "RL", flow: "P" };

/** Identifiant lisible : celui de la fiche visée, sinon rang dans le lancement (`P-007`, `RL-002`). */
export function refOf(proposal: ProposalOutput): string {
  const specId = text(proposal.content.specId);
  return (
    specId ||
    `${RANK_PREFIX[proposal.kind] ?? "P"}-${String(proposal.position + 1).padStart(3, "0")}`
  );
}

const RULE_TYPE_TEXT: Record<string, string> = {
  contrainte: "contrainte",
  calcul: "calcul",
  workflow: "workflow à états",
};

const countOf = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
const plural = (n: number, one: string, other: string): string => `${n} ${n >= 2 ? other : one}`;

/** Ligne secondaire : « Fonctionnalité · Haute · 2 critères », « Règle · calcul », « Rôle · 4 permissions », « Parcours · 5 étapes ». */
export function subtitleOf(proposal: ProposalOutput): string {
  const { content } = proposal;
  const label = KIND_LABELS[proposal.kind] ?? proposal.kind;
  if (proposal.kind === "rule")
    return `${label} · ${RULE_TYPE_TEXT[text(content.type)] ?? "contrainte"}`;
  if (proposal.kind === "role")
    return `${label} · ${plural(countOf(content.permissions), "permission", "permissions")}`;
  if (proposal.kind === "flow") {
    const steps = countOf(content.steps) + (text(content.start) ? 1 : 0);
    return `${label} · ${plural(steps, "étape", "étapes")}`;
  }
  const parts = [label];
  const priority = text(content.priority);
  if (priority) parts.push(priorityLabel(priority));
  parts.push(countLabel(countOf(content.criteria), ["critère", "critères"]));
  return parts.join(" · ");
}
