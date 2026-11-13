import { priorityLabel } from "./feature-labels.ts";
import { FEATURES_TABS, tabOfProposalKind } from "./features-tab.ts";
import { tableRefOf } from "./proposal-data.ts";
import type { ProposalOutput } from "./proposal-types.ts";

/** Livrables dont l'agent propose le contenu : le cahier fonctionnel (TK-99b) et le modèle de données (TK-107). */
export type Deliverable = "functional" | "data";
/** Livrable des écrans qui ne le précisent pas : le cahier fonctionnel. */
export const DEFAULT_DELIVERABLE: Deliverable = "functional";

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

/** Textes de la modale du modèle de données (maquette 11 : « Ce que l'agent va faire »). */
const DATA_MODE_TEXTS: typeof MODE_TEXTS = {
  complete: {
    title: "Compléter le modèle",
    description: "Tables, champs et relations qu'exigent les fonctionnalités enregistrées.",
  },
  all: {
    title: "Tout reproposer",
    description: "Repart du cahier fonctionnel ; ce qui est enregistré reste.",
  },
};

/** Textes des choix de la modale pour un livrable. */
export const modeTextsOf = (deliverable: Deliverable): typeof MODE_TEXTS =>
  deliverable === "data" ? DATA_MODE_TEXTS : MODE_TEXTS;

export const KIND_LABELS: Record<string, string> = {
  table: "Table",
  relations: "Relations",
  fixtures: "Jeux d'exemple",
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
/** Identifiant des propositions de données sans fiche : une table `T-<slug>`, « REL » pour les relations, « FX » pour un jeu. */
const DATA_REFS: Record<string, string> = { relations: "REL" };

/** Identifiant lisible : celui de la fiche visée, sinon rang dans le lancement (`P-007`, `RL-002`). */
export function refOf(proposal: ProposalOutput): string {
  const specId = text(proposal.content.specId);
  if (proposal.kind === "table") return tableRefOf(text(proposal.content.name));
  if (proposal.kind === "fixtures")
    return `FX-${tableRefOf(text(proposal.content.title)).slice(2)}`;
  if (proposal.kind === "relations") return DATA_REFS.relations ?? "REL";
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

/** « Table · 5 champs · ← F-001, F-002 » (maquette 11 l.571). */
function dataSubtitle(content: Record<string, unknown>): string {
  const sources = Array.isArray(content.sources)
    ? content.sources.filter((s) => typeof s === "string")
    : [];
  return [
    `Table · ${plural(countOf(content.fields), "champ", "champs")}`,
    ...(sources.length > 0 ? [`← ${sources.join(", ")}`] : []),
  ].join(" · ");
}

/** Ligne secondaire : « Fonctionnalité · Haute · 2 critères », « Règle · calcul », « Rôle · 4 permissions », « Parcours · 5 étapes ». */
export function subtitleOf(proposal: ProposalOutput): string {
  const { content } = proposal;
  const label = KIND_LABELS[proposal.kind] ?? proposal.kind;
  if (proposal.kind === "table") return dataSubtitle(content);
  if (proposal.kind === "relations")
    return plural(
      countOf(content.relations),
      "relation entre les tables",
      "relations entre les tables",
    );
  if (proposal.kind === "fixtures")
    return `${label} · ${plural(countOf(content.rows), "ligne", "lignes")} · ${text(content.table)}`;
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
