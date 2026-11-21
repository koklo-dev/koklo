import type { IconName } from "@koklo/ui";
import { applyReview, nonEmpty, setOrDelete } from "./spec-url.ts";

/**
 * Onglets de l'écran Architecture (`/projects/<id>/spec/architecture`, maquette 13 l.58-88) : Relecture devant les
 * onglets de lecture tant qu'une relecture est ouverte (`view=review`). Schéma, Décisions et Flux arrivent avec
 * TK-112 et TK-113 : aucun bouton mort d'ici là (B509).
 */
export const ARCHITECTURE_TABS = ["review", "document", "components"] as const;
export type ArchitectureTab = (typeof ARCHITECTURE_TABS)[number];

export const ARCHITECTURE_TAB_LABELS: Record<ArchitectureTab, string> = {
  review: "Relecture",
  document: "Document",
  components: "Composants",
};

export const ARCHITECTURE_TAB_ICONS: Record<ArchitectureTab, IconName> = {
  review: "rate_review",
  document: "description",
  components: "widgets",
};

/** Onglets affichés : « Relecture » en tête quand une relecture est ouverte, sinon absent. */
export const visibleArchitectureTabs = (reviewing: boolean): readonly ArchitectureTab[] =>
  reviewing ? ARCHITECTURE_TABS : ARCHITECTURE_TABS.filter((tab) => tab !== "review");

const COMPONENT_ID = /^C-[a-z0-9][a-z0-9-]*$/;
const SECTION_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const DEFAULT_TAB: ArchitectureTab = "components";

export interface ArchitectureUrl {
  tab: ArchitectureTab;
  review: boolean;
  /** Composant ouvert à l'arrivée (`?c=C-slug`) : la liste s'ouvre sur la page qui le contient. */
  c: string | undefined;
  /** Section du document ouverte (`?s=slug`). */
  s: string | undefined;
  q: string | undefined;
  zone: string | undefined;
  new: boolean;
  edit: string | undefined;
}

const matching = (value: string | null, pattern: RegExp): string | undefined =>
  value && pattern.test(value) ? value : undefined;

/** Lit l'adresse : onglet inconnu = Composants ; Relecture seulement si `view=review` ; identifiants invalides ignorés. */
export function readArchitectureUrl(search: string): ArchitectureUrl {
  const params = new URLSearchParams(search);
  const review = params.get("view") === "review";
  const asked = ARCHITECTURE_TABS.find((tab) => tab === params.get("tab"));
  const fallback: ArchitectureTab = review ? "review" : DEFAULT_TAB;
  const tab = asked === "review" ? fallback : (asked ?? fallback);
  return {
    tab,
    review,
    c: matching(params.get("c"), COMPONENT_ID),
    s: matching(params.get("s"), SECTION_SLUG),
    q: nonEmpty(params.get("q")),
    zone: nonEmpty(params.get("zone")),
    new: params.get("new") === "1",
    edit: matching(params.get("edit"), COMPONENT_ID),
  };
}

export interface ArchitectureUrlPatch {
  tab?: ArchitectureTab | null;
  review?: boolean | null;
  c?: string | null;
  s?: string | null;
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
  setOrDelete(params, "q", patch.q);
  setOrDelete(params, "zone", patch.zone);
  setOrDelete(params, "edit", patch.edit);
  if (patch.new !== undefined) setOrDelete(params, "new", patch.new ? "1" : null);
  applyReview(params, patch);
  const text = params.toString();
  return text ? `?${text}` : "";
}
