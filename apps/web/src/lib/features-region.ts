import type { FeaturesView } from "./features-view.ts";
import type { FeatureWrite } from "./use-feature-submit.ts";

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

/** Suivi du lot au-delà de 60 s : ce n'est pas une erreur, l'écriture continue sans la page. */
export const SLOW_TEXT =
  "L'enregistrement prend plus de temps que prévu. Il continue sans vous : votre saisie est gardée.";
/** Lot écrit mais index pas encore à jour au bout de 30 s. */
export const LATE_TEXT =
  "Votre modification est enregistrée. La liste se mettra à jour dans un instant.";

function progressSuffix(meta: FeatureWrite["meta"]): string {
  if (!meta?.specId) return "";
  if (meta.kind === "create") return ` ${meta.specId} en cours de création.`;
  return meta.kind === "delete" ? ` ${meta.specId} en cours de suppression.` : "";
}

/** Textes de la région d'état selon la nature de l'écriture (enregistrement ou suppression). */
function progressTexts(meta: FeatureWrite["meta"]) {
  const deleting = meta?.kind === "delete";
  return {
    closed: `${deleting ? "Suppression" : "Enregistrement"} de « ${meta?.title ?? ""} » en cours…`,
    sending: deleting ? "Envoi de la suppression…" : "Envoi de votre modification…",
    committing: deleting ? "Suppression en cours…" : "Écriture en cours…",
  };
}

/** Texte de la région d'état pour l'écriture en cours (formulaire ouvert : étapes ; fermé : suivi de la page). */
export function writeRegionText(write: FeatureWrite, formOpen: boolean): string {
  const { phase, meta, batch, slow } = write;
  if (!["sending", "tracking", "indexing"].includes(phase)) return "";
  const texts = progressTexts(meta);
  if (!formOpen) return slow ? "" : texts.closed;
  if (phase === "sending") return texts.sending;
  if (phase !== "tracking" || slow) return "";
  if (batch?.status === "committing") return texts.committing;
  return `En attente de son tour.${progressSuffix(meta)}`;
}
