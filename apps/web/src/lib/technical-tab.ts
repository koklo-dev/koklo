import type { IconName } from "@koklo/ui";
import { applyReview, nonEmpty, setOrDelete } from "./spec-url.ts";

/**
 * Onglets de la page Technique (`/projects/<id>/spec/technical`, maquette 14 l.817-826) : Relecture devant tant qu'une
 * relecture est ouverte. API et Exigences arrivent avec TK-116 : aucun onglet mort.
 */
export const TECHNICAL_TABS = ["review", "stack", "environments", "document"] as const;
export type TechnicalTab = (typeof TECHNICAL_TABS)[number];

export const TECHNICAL_TAB_LABELS: Record<TechnicalTab, string> = {
  review: "Relecture",
  stack: "Stack",
  environments: "Environnements",
  document: "Document",
};

export const TECHNICAL_TAB_ICONS: Record<TechnicalTab, IconName> = {
  review: "rate_review",
  stack: "layers",
  environments: "dns",
  document: "description",
};

export const visibleTechnicalTabs = (reviewing: boolean): readonly TechnicalTab[] =>
  reviewing ? TECHNICAL_TABS : TECHNICAL_TABS.filter((tab) => tab !== "review");

export const STACK_ID = /^ST-[a-z0-9][a-z0-9-]*$/;
const EDITABLE = /^(ST|ENV)-[a-z0-9][a-z0-9-]*$/;
const SECTION_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export interface TechnicalUrl {
  tab: TechnicalTab;
  review: boolean;
  /** Choix ouvert (`?sel=ST-…`). */
  sel: string | undefined;
  /** Section du document ouverte (`?s=slug`). */
  s: string | undefined;
  q: string | undefined;
  new: boolean;
  /** Choix (`ST-…`) ou environnement (`ENV-…`) modifié dans la feuille. */
  edit: string | undefined;
}

const matching = (value: string | null, pattern: RegExp): string | undefined =>
  value && pattern.test(value) ? value : undefined;

/** Lit l'adresse : onglet inconnu ou absent : Stack (Relecture si `view=review`) ; identifiants invalides ignorés. */
export function readTechnicalUrl(search: string): TechnicalUrl {
  const params = new URLSearchParams(search);
  const review = params.get("view") === "review";
  const asked = TECHNICAL_TABS.find((tab) => tab === params.get("tab"));
  const fallback: TechnicalTab = review ? "review" : "stack";
  return {
    tab: asked === "review" ? fallback : (asked ?? fallback),
    review,
    sel: matching(params.get("sel"), STACK_ID),
    s: matching(params.get("s"), SECTION_SLUG),
    q: nonEmpty(params.get("q")),
    new: params.get("new") === "1",
    edit: matching(params.get("edit"), EDITABLE),
  };
}

export interface TechnicalUrlPatch {
  tab?: TechnicalTab | null;
  review?: boolean | null;
  sel?: string | null;
  s?: string | null;
  q?: string | null;
  new?: boolean | null;
  edit?: string | null;
}

/** Applique un patch à la requête : `null` ou chaîne vide retire le paramètre ; renvoie `?…` ou `""`. */
export function withTechnicalUrl(search: string, patch: TechnicalUrlPatch): string {
  const params = new URLSearchParams(search);
  for (const key of ["tab", "sel", "s", "q", "edit"] as const) {
    setOrDelete(params, key, patch[key]);
  }
  if (patch.new !== undefined) setOrDelete(params, "new", patch.new ? "1" : null);
  applyReview(params, patch);
  const text = params.toString();
  return text ? `?${text}` : "";
}
