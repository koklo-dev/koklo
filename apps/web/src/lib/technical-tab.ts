import type { IconName } from "@koklo/ui";
import { applyReview, nonEmpty, setOrDelete } from "./spec-url.ts";

/**
 * Onglets de la page Technique (`/projects/<id>/spec/technical`, maquette 14 l.813-817) : Relecture devant tant qu'une
 * relecture est ouverte.
 */
export const TECHNICAL_TABS = [
  "review",
  "stack",
  "api",
  "nfr",
  "environments",
  "document",
] as const;
export type TechnicalTab = (typeof TECHNICAL_TABS)[number];

export const TECHNICAL_TAB_LABELS: Record<TechnicalTab, string> = {
  review: "Relecture",
  stack: "Stack",
  api: "API",
  nfr: "Exigences",
  environments: "Environnements",
  document: "Document",
};

export const TECHNICAL_TAB_ICONS: Record<TechnicalTab, IconName> = {
  review: "rate_review",
  stack: "layers",
  api: "api",
  nfr: "speed",
  environments: "dns",
  document: "description",
};

export const visibleTechnicalTabs = (reviewing: boolean): readonly TechnicalTab[] =>
  reviewing ? TECHNICAL_TABS : TECHNICAL_TABS.filter((tab) => tab !== "review");

export const STACK_ID = /^ST-[a-z0-9][a-z0-9-]*$/;
/** Opération `zone.verbe` et exigence `NFR-…` (motifs du contrat). */
const OPERATION_NAME = /^[a-z0-9][A-Za-z0-9_-]*\.[a-z0-9][A-Za-z0-9_-]*$/;
const NFR_ID = /^NFR-[a-z0-9][a-z0-9-]*$/;
const EDITABLE = /^(ST|ENV|NFR)-[a-z0-9][a-z0-9-]*$/;
const SECTION_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export interface TechnicalUrl {
  tab: TechnicalTab;
  review: boolean;
  /** Choix ouvert (`?sel=ST-…`). */
  sel: string | undefined;
  /** Opération ouverte (`?op=zone.verbe`). */
  op: string | undefined;
  /** Zone filtrée des opérations (`?zone=`). */
  zone: string | undefined;
  /** Exigence à amener dans la page (`?nfr=NFR-…`). */
  nfr: string | undefined;
  /** Section du document ouverte (`?s=slug`). */
  s: string | undefined;
  /** Recherche de l'onglet ouvert (Stack ou API). */
  q: string | undefined;
  new: boolean;
  /** Élément modifié dans la feuille : `ST-…`, `ENV-…`, `NFR-…` ou `zone.verbe`. */
  edit: string | undefined;
}

const matching = (value: string | null, ...patterns: RegExp[]): string | undefined =>
  value && patterns.some((pattern) => pattern.test(value)) ? value : undefined;

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
    op: matching(params.get("op"), OPERATION_NAME),
    zone: nonEmpty(params.get("zone")),
    nfr: matching(params.get("nfr"), NFR_ID),
    s: matching(params.get("s"), SECTION_SLUG),
    q: nonEmpty(params.get("q")),
    new: params.get("new") === "1",
    edit: matching(params.get("edit"), EDITABLE, OPERATION_NAME),
  };
}

export interface TechnicalUrlPatch {
  tab?: TechnicalTab | null;
  review?: boolean | null;
  sel?: string | null;
  op?: string | null;
  zone?: string | null;
  nfr?: string | null;
  s?: string | null;
  q?: string | null;
  new?: boolean | null;
  edit?: string | null;
}

/** Applique un patch à la requête : `null` ou chaîne vide retire le paramètre ; renvoie `?…` ou `""`. */
export function withTechnicalUrl(search: string, patch: TechnicalUrlPatch): string {
  const params = new URLSearchParams(search);
  // La recherche appartient à l'onglet : en changer la remet à zéro.
  if (patch.tab !== undefined && patch.tab !== readTechnicalUrl(search).tab) params.delete("q");
  for (const key of ["tab", "sel", "op", "zone", "nfr", "s", "q", "edit"] as const) {
    setOrDelete(params, key, patch[key]);
  }
  if (patch.new !== undefined) setOrDelete(params, "new", patch.new ? "1" : null);
  applyReview(params, patch);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export type TechnicalForm = "stack" | "environment" | "operation" | "nfr";

const FORM_OF_TAB: Partial<Record<TechnicalTab, TechnicalForm>> = {
  environments: "environment",
  api: "operation",
  nfr: "nfr",
};

/** Feuille à ouvrir : celle de l'identifiant modifié ; à la création, celle de l'onglet (Stack par défaut). */
export function technicalFormOf(specId: string | undefined, tab: TechnicalTab): TechnicalForm {
  if (!specId) return FORM_OF_TAB[tab] ?? "stack";
  if (specId.startsWith("ENV-")) return "environment";
  if (specId.startsWith("NFR-")) return "nfr";
  return specId.startsWith("ST-") ? "stack" : "operation";
}

/** Paramètre qui désigne un élément enregistré : il reste ouvert à la fermeture de la feuille. */
export function technicalSelectionOf(specId: string | undefined): TechnicalUrlPatch {
  if (!specId) return {};
  const key = { stack: "sel", operation: "op", nfr: "nfr", environment: undefined } as const;
  const name = key[technicalFormOf(specId, "stack")];
  return name ? { [name]: specId } : {};
}

const TAB_OF_FORM: Record<TechnicalForm, TechnicalTab> = {
  stack: "stack",
  environment: "environments",
  operation: "api",
  nfr: "nfr",
};

/** Adresse qui ouvre un élément enregistré (avis d'écriture) : son onglet et sa sélection. */
export const technicalTargetOf = (specId: string): TechnicalUrlPatch => ({
  tab: TAB_OF_FORM[technicalFormOf(specId, "stack")],
  ...technicalSelectionOf(specId),
});
