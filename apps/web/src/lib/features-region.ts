import type { FeaturesView } from "./features-view.ts";

export const plural = (count: number, word: string): string =>
  `${count} ${word}${count > 1 ? "s" : ""}`;

/** « N fonctionnalité(s) » sans filtre, « N fonctionnalité(s) affichée(s) [sur plus de N] » avec un filtre. */
export function counterText(options: {
  filtered: boolean;
  total: number | undefined;
  shown: number;
  hasNext: boolean;
}): string {
  const { filtered, total, shown, hasNext } = options;
  if (!filtered) return total === undefined ? "" : plural(total, "fonctionnalité");
  const base = `${plural(shown, "fonctionnalité")} ${shown > 1 ? "affichées" : "affichée"}`;
  return hasNext ? `${base} sur plus de ${shown}` : base;
}

interface RegionSources {
  view: FeaturesView;
  filtered: boolean;
  total: number | undefined;
  shown: number;
  hasNext: boolean;
  expired: boolean;
}

/** Texte de la région d'état unique de l'écran (chargement, compteur, vide filtré, préparation). */
export function regionText({ view, expired, ...counter }: RegionSources): string {
  switch (view.kind) {
    case "loading":
      return "Chargement des fonctionnalités…";
    case "list":
      return counterText(counter);
    case "empty-filtered":
      return "Aucune fonctionnalité ne correspond à ces filtres.";
    case "preparing":
      return expired ? "" : "Préparation de la spec en cours.";
    default:
      return "";
  }
}

/** Vues où le projet a une spec lisible : les filtres et la ligne de version ont un sens. */
const FILTERED_VIEWS = ["loading", "list", "empty-filtered", "error"];
const VERSIONED_VIEWS = ["loading", "list", "empty", "empty-filtered"];

export const showsFilters = (view: FeaturesView): boolean => FILTERED_VIEWS.includes(view.kind);
export const showsVersion = (view: FeaturesView): boolean => VERSIONED_VIEWS.includes(view.kind);
