import type { IconName } from "@koklo/ui";
import { applyReview, nonEmpty, setOrDelete } from "./spec-url.ts";

/** Onglets de la page Sécurité (`/projects/<id>/spec/security`, maquette 15 l.667) : Relecture devant tant qu'elle dure. */
export const SECURITY_TABS = [
  "review",
  "threats",
  "data",
  "rights",
  "reqs",
  "summary",
  "doc",
] as const;
export type SecurityTab = (typeof SECURITY_TABS)[number];

export const SECURITY_TAB_LABELS: Record<SecurityTab, string> = {
  review: "Relecture",
  threats: "Menaces",
  data: "Données sensibles",
  rights: "Droits",
  reqs: "Exigences",
  summary: "Résumé client",
  doc: "Document",
};

export const SECURITY_TAB_ICONS: Record<SecurityTab, IconName> = {
  review: "rate_review",
  threats: "gpp_maybe",
  data: "badge",
  rights: "admin_panel_settings",
  reqs: "verified_user",
  summary: "summarize",
  doc: "description",
};

export const visibleSecurityTabs = (reviewing: boolean): readonly SecurityTab[] =>
  reviewing ? SECURITY_TABS : SECURITY_TABS.filter((tab) => tab !== "review");

export const THREAT_FILTER_VALUES = ["high", "todo", "ci"] as const;
export type ThreatFilter = (typeof THREAT_FILTER_VALUES)[number];

/** Menace `SEC-Txx` et champ `<slug de table>.<champ>` (motifs du contrat). */
const THREAT_ID = /^SEC-T\d{2,}$/;
const DATA_FIELD = /^[a-z0-9][a-z0-9-]{0,62}\.[a-z_][a-z0-9_]{0,62}$/;
const SECTION_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export interface SecurityUrl {
  tab: SecurityTab;
  review: boolean;
  /** Menace ouverte (`?threat=SEC-T08`). */
  threat: string | undefined;
  filter: ThreatFilter | undefined;
  /** Recherche de l'onglet ouvert (Menaces ou Données). */
  q: string | undefined;
  /** Champ à amener dans la liste, ou à classer (`?data=table.champ`). */
  data: string | undefined;
  /** « À décider » seulement (`?undecided=1`). */
  undecided: boolean;
  /** Section du document ouverte (`?s=slug`). */
  s: string | undefined;
  new: boolean;
  /** Élément modifié dans la feuille : `SEC-Txx` ou `table.champ`. */
  edit: string | undefined;
}

const matching = (value: string | null, ...patterns: RegExp[]): string | undefined =>
  value && patterns.some((pattern) => pattern.test(value)) ? value : undefined;

/** Lit l'adresse : onglet inconnu ou absent : Menaces (Relecture si elle est ouverte) ; valeurs invalides ignorées. */
export function readSecurityUrl(search: string): SecurityUrl {
  const params = new URLSearchParams(search);
  const asked = SECURITY_TABS.find((tab) => tab === params.get("tab"));
  const review = params.get("view") === "review" || asked === "review";
  const fallback: SecurityTab = review ? "review" : "threats";
  return {
    tab: asked === "review" ? "review" : (asked ?? fallback),
    review,
    threat: matching(params.get("threat"), THREAT_ID),
    filter: THREAT_FILTER_VALUES.find((value) => value === params.get("filter")),
    q: nonEmpty(params.get("q")),
    data: matching(params.get("data"), DATA_FIELD),
    undecided: params.get("undecided") === "1",
    s: matching(params.get("s"), SECTION_SLUG),
    new: params.get("new") === "1",
    edit: matching(params.get("edit"), THREAT_ID, DATA_FIELD),
  };
}

export interface SecurityUrlPatch {
  tab?: SecurityTab | null;
  review?: boolean | null;
  threat?: string | null;
  filter?: ThreatFilter | null;
  q?: string | null;
  data?: string | null;
  undecided?: boolean | null;
  s?: string | null;
  new?: boolean | null;
  edit?: string | null;
}

const flag = (value: boolean | null | undefined) =>
  value === undefined ? undefined : value ? "1" : null;

/** Applique un patch à la requête : `null` ou chaîne vide retire le paramètre ; renvoie `?…` ou `""`. */
export function withSecurityUrl(search: string, patch: SecurityUrlPatch): string {
  const params = new URLSearchParams(search);
  // Recherche et filtres appartiennent à l'onglet : en changer les remet à zéro.
  if (patch.tab !== undefined && patch.tab !== readSecurityUrl(search).tab) {
    for (const key of ["q", "filter", "undecided"]) params.delete(key);
  }
  for (const key of ["tab", "threat", "filter", "q", "data", "s", "edit"] as const) {
    setOrDelete(params, key, patch[key]);
  }
  setOrDelete(params, "new", flag(patch.new));
  setOrDelete(params, "undecided", flag(patch.undecided));
  applyReview(params, patch);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export type SecurityForm = "threat" | "sensitive";

/** Feuille à ouvrir : celle de l'identifiant modifié ; à la création, celle de l'onglet (Menace par défaut). */
export function securityFormOf(specId: string | undefined, tab: SecurityTab): SecurityForm {
  if (specId) return THREAT_ID.test(specId) ? "threat" : "sensitive";
  return tab === "data" ? "sensitive" : "threat";
}

/** Adresse qui ouvre un élément enregistré : son onglet et sa sélection. */
export const securityTargetOf = (specId: string): SecurityUrlPatch =>
  securityFormOf(specId, "threats") === "threat"
    ? { tab: "threats", threat: specId }
    : { tab: "data", data: specId };
