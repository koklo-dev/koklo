import { priorityLabel } from "./feature-labels.ts";
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

const countLabel = (n: number, [one, other]: [string, string]): string =>
  `${n} ${n >= 2 ? other : one}`;
export const optionCountLabel = (mode: string, count: number | undefined): string | undefined => {
  const noun = MODE_TEXTS[mode]?.noun;
  return count !== undefined && noun ? countLabel(count, noun) : undefined;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const criteriaOf = (content: Record<string, unknown>): unknown[] =>
  Array.isArray(content.criteria) ? content.criteria : [];

/** Identifiant lisible : `F-nnn` d'une fonctionnalité visée, sinon rang dans le lancement (`P-007`). */
export function refOf(proposal: ProposalOutput): string {
  const specId = text(proposal.content.specId);
  return specId || `P-${String(proposal.position + 1).padStart(3, "0")}`;
}

/** Ligne secondaire : « Fonctionnalité · Haute · 2 critères ». */
export function subtitleOf(proposal: ProposalOutput): string {
  const n = criteriaOf(proposal.content).length;
  const parts = [KIND_LABELS[proposal.kind] ?? proposal.kind];
  const priority = text(proposal.content.priority);
  if (priority) parts.push(priorityLabel(priority));
  parts.push(countLabel(n, ["critère", "critères"]));
  return parts.join(" · ");
}
