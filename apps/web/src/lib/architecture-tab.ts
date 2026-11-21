import type { IconName } from "@koklo/ui";
import { applyReview, nonEmpty, setOrDelete } from "./spec-url.ts";

/**
 * Onglets de l'écran Architecture (`/projects/<id>/spec/architecture`, maquette 13 l.892) : Relecture devant les
 * onglets de lecture tant qu'une relecture est ouverte (`view=review`). Décisions : TK-113 (B583).
 */
export const ARCHITECTURE_TABS = [
  "review",
  "schema",
  "document",
  "components",
  "decisions",
  "flows",
] as const;
export type ArchitectureTab = (typeof ARCHITECTURE_TABS)[number];

export const ARCHITECTURE_TAB_LABELS: Record<ArchitectureTab, string> = {
  review: "Relecture",
  schema: "Schéma",
  document: "Document",
  components: "Composants",
  decisions: "Décisions",
  flows: "Flux",
};

export const ARCHITECTURE_TAB_ICONS: Record<ArchitectureTab, IconName> = {
  review: "rate_review",
  schema: "hub",
  document: "description",
  components: "widgets",
  decisions: "gavel",
  flows: "swap_horiz",
};

/** Onglets affichés : « Relecture » en tête quand une relecture est ouverte, sinon absent. */
export const visibleArchitectureTabs = (reviewing: boolean): readonly ArchitectureTab[] =>
  reviewing ? ARCHITECTURE_TABS : ARCHITECTURE_TABS.filter((tab) => tab !== "review");

const COMPONENT_ID = /^C-[a-z0-9][a-z0-9-]*$/;
const SECTION_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const FLOW_ID = /^P-[a-z0-9][a-z0-9-]*$/;
const ADR_ID = /^ADR-\d{3,}$/;
/** Statuts d'une décision et périodes proposées par la puce « Date » (B583), dans l'adresse. */
export const ADR_STATUS_PARAMS = ["proposee", "acceptee", "remplacee"] as const;
export type AdrStatusParam = (typeof ADR_STATUS_PARAMS)[number];
export const ADR_PERIODS = ["30j", "90j", "annee"] as const;
export type AdrPeriod = (typeof ADR_PERIODS)[number];
/** Nœud choisi dans le schéma : un composant ou un rôle acteur. */
const NODE_ID = /^(C|RL)-[a-z0-9][a-z0-9-]*$/;

export interface ArchitectureUrl {
  tab: ArchitectureTab;
  review: boolean;
  /** Composant ouvert à l'arrivée (`?c=C-slug`) : la liste s'ouvre sur la page qui le contient. */
  c: string | undefined;
  /** Section du document ouverte (`?s=slug`). */
  s: string | undefined;
  /** Nœud choisi dans le schéma (`?sel=C-slug` ou `RL-slug`). */
  sel: string | undefined;
  /** Flux ouvert dans l'onglet Flux (`?f=P-slug`). */
  f: string | undefined;
  /** Décision ouverte dans l'onglet Décisions (`?d=ADR-nnn`) ; filtres `status`, `component` et `period`. */
  d: string | undefined;
  status: AdrStatusParam | undefined;
  component: string | undefined;
  period: AdrPeriod | undefined;
  q: string | undefined;
  zone: string | undefined;
  new: boolean;
  edit: string | undefined;
}

const EDITABLE = new RegExp(`${COMPONENT_ID.source}|${FLOW_ID.source}|${ADR_ID.source}`);

const matching = (value: string | null, pattern: RegExp): string | undefined =>
  value && pattern.test(value) ? value : undefined;

/**
 * Lit l'adresse : sans onglet, Schéma à partir de 1024 px (`wide`) et Composants en dessous (B548) ; un onglet demandé
 * prime ; un onglet inconnu retombe sur le défaut ; Relecture seulement si `view=review` ; identifiants invalides ignorés.
 */
export function readArchitectureUrl(search: string, wide = true): ArchitectureUrl {
  const params = new URLSearchParams(search);
  const review = params.get("view") === "review";
  const asked = ARCHITECTURE_TABS.find((tab) => tab === params.get("tab"));
  const fallback: ArchitectureTab = review ? "review" : wide ? "schema" : "components";
  const tab = asked === "review" ? fallback : (asked ?? fallback);
  return {
    tab,
    review,
    c: matching(params.get("c"), COMPONENT_ID),
    s: matching(params.get("s"), SECTION_SLUG),
    sel: matching(params.get("sel"), NODE_ID),
    f: matching(params.get("f"), FLOW_ID),
    d: matching(params.get("d"), ADR_ID),
    status: ADR_STATUS_PARAMS.find((value) => value === params.get("status")),
    component: matching(params.get("component"), COMPONENT_ID),
    period: ADR_PERIODS.find((value) => value === params.get("period")),
    q: nonEmpty(params.get("q")),
    zone: nonEmpty(params.get("zone")),
    new: params.get("new") === "1",
    edit: matching(params.get("edit"), EDITABLE),
  };
}

export interface ArchitectureUrlPatch {
  tab?: ArchitectureTab | null;
  review?: boolean | null;
  c?: string | null;
  s?: string | null;
  sel?: string | null;
  f?: string | null;
  d?: string | null;
  status?: AdrStatusParam | null;
  component?: string | null;
  period?: AdrPeriod | null;
  q?: string | null;
  zone?: string | null;
  new?: boolean | null;
  edit?: string | null;
}

/** Applique un patch à la requête : `null` ou chaîne vide retire le paramètre ; renvoie `?…` ou `""`. */
export function withArchitectureUrl(search: string, patch: ArchitectureUrlPatch): string {
  const params = new URLSearchParams(search);
  setOrDelete(params, "tab", patch.tab);
  setOrDelete(params, "c", patch.c);
  setOrDelete(params, "s", patch.s);
  setOrDelete(params, "sel", patch.sel);
  setOrDelete(params, "f", patch.f);
  setOrDelete(params, "d", patch.d);
  setOrDelete(params, "status", patch.status);
  setOrDelete(params, "component", patch.component);
  setOrDelete(params, "period", patch.period);
  setOrDelete(params, "q", patch.q);
  setOrDelete(params, "zone", patch.zone);
  setOrDelete(params, "edit", patch.edit);
  if (patch.new !== undefined) setOrDelete(params, "new", patch.new ? "1" : null);
  applyReview(params, patch);
  const text = params.toString();
  return text ? `?${text}` : "";
}
