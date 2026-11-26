import { priorityLabel } from "./feature-labels.ts";
import { FEATURES_TABS, tabOfProposalKind } from "./features-tab.ts";
import {
  architectureRefOf,
  architectureSubtitleOf,
  isArchitectureKind,
} from "./proposal-architecture.ts";
import { tableRefOf } from "./proposal-data.ts";
import type { ProposalOutput } from "./proposal-types.ts";

/** Livrables dont l'agent propose le contenu : le cahier fonctionnel (TK-99b), le modèle de données (TK-107) et l'architecture (TK-111). */
export type Deliverable = "functional" | "data" | "architecture";
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

/** Textes de la modale de l'architecture (maquette 13 l.869-871), dans l'ordre du serveur. */
const ARCHITECTURE_MODE_TEXTS: typeof MODE_TEXTS = {
  complete: {
    title: "Compléter l'architecture",
    description: "Composants, décisions et flux qui manquent pour couvrir les parcours.",
  },
  decision: {
    title: "Proposer une décision",
    description: "Une ADR pour un choix encore ouvert, avec ses options.",
  },
  document: {
    title: "Rédiger le document",
    description: "Les sections à rédiger de la vue d'ensemble.",
  },
  all: {
    title: "Tout reproposer",
    description: "Repart des livrables validés ; ce qui est enregistré reste.",
  },
};

const MODE_TEXTS_OF: Record<Deliverable, typeof MODE_TEXTS> = {
  functional: MODE_TEXTS,
  data: DATA_MODE_TEXTS,
  architecture: ARCHITECTURE_MODE_TEXTS,
};

/** Textes des choix de la modale pour un livrable. */
export const modeTextsOf = (deliverable: Deliverable): typeof MODE_TEXTS =>
  MODE_TEXTS_OF[deliverable];

export const KIND_LABELS: Record<string, string> = {
  table: "Table",
  relations: "Relations",
  fixtures: "Jeux d'exemple",
  feature: "Fonctionnalité",
  criteria: "Critères",
  rule: "Règle",
  role: "Rôle",
  flow: "Parcours",
  component: "Composant",
  archflow: "Flux",
  adr: "Décision",
  doc_section: "Section du document",
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
/** Motifs d'une proposition écartée à l'enregistrement (B672), en mots simples. */
const SKIP_REASON_TEXTS: Record<string, string> = {
  exists: "existe déjà dans la spec",
  missing: "n'existe plus dans la spec",
  duplicate: "en double dans l'enregistrement",
};
export const skipReasonText = (reason: string): string =>
  SKIP_REASON_TEXTS[reason] ?? "écartée par la vérification de la spec";

/** « M remises à relire : existe déjà dans la spec » : une raison par proposition remise à relire. */
function returnedText(reasons: readonly string[]): string {
  const n = reasons.length;
  const why = [...new Set(reasons.map(skipReasonText))].join(", ");
  return `${n} remise${n >= 2 ? "s" : ""} à relire : ${why}`;
}

/** « K proposition(s) écartée(s) : déjà présente(s) dans la spec » (B703). */
const presentText = (k: number): string =>
  k >= 2
    ? `${k} propositions écartées : déjà présentes dans la spec`
    : `${k} proposition écartée : déjà présente dans la spec`;

/**
 * « N enregistrées dans la spec », « N enregistrées, L à reprendre », suivi de « · K propositions écartées : déjà
 * présentes dans la spec » puis de « · M remises à relire : motif ».
 */
export const SAVED_TEXT = (
  saved: number,
  left: number,
  returned: readonly string[] = [],
  present = 0,
): string => {
  const done =
    left === 0
      ? `${saved} enregistrée${saved >= 2 ? "s" : ""} dans la spec`
      : `${saved} enregistrée${saved >= 2 ? "s" : ""}, ${left} à reprendre`;
  return [
    done,
    ...(present > 0 ? [presentText(present)] : []),
    ...(returned.length > 0 ? [returnedText(returned)] : []),
  ].join(" · ");
};
export const BLOCKED_TEXT = "Enregistrement échoué · à réessayer";

/** Motif d'un lot d'enregistrement échoué (B674) : jamais le code ni le texte du fournisseur. */
function saveFailureReason(code: string | null): string {
  if (code === "write_conflict" || code === "stale_base" || code === "conflict")
    return "un élément proposé existait déjà dans la spec ou avait changé entre-temps";
  if (code === "SPEC_INVALID") return "la spec obtenue aurait contenu des erreurs";
  if (code?.startsWith("PROVIDER_")) return "le dépôt de la spec n'a pas répondu";
  return "l'enregistrement n'a pas pu se terminer";
}

export const SAVE_FAILURE_TEXT = (count: number, code: string | null): string =>
  `L'enregistrement de ${count} ${count >= 2 ? "propositions acceptées" : "proposition acceptée"} n'a pas abouti : ${saveFailureReason(code)}. Rien n'a été écrit dans la spec.`;
/** Suffixe du résumé du bandeau des onglets hors Relecture tant qu'un enregistrement a échoué (S-spec-architecture §16). */
export const SAVE_FAILURE_SUFFIX = " · enregistrement à reprendre dans la Relecture";

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
  if (isArchitectureKind(proposal.kind)) return architectureRefOf(proposal);
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
  if (isArchitectureKind(proposal.kind)) return architectureSubtitleOf(proposal);
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
