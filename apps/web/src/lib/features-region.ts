import { formatCount } from "@koklo/ui";
import type { FeaturesView } from "./features-view.ts";
import type { FeatureWrite, WriteMeta } from "./use-feature-submit.ts";
import type { Placement } from "./use-index-wait.ts";

export const plural = (count: number, word: string): string =>
  `${count} ${word}${count > 1 ? "s" : ""}`;

/** Texte de la région d'état quand la barre de compte n'est pas affichée (chargement, préparation). */
export function regionText({
  view,
  expired,
  noun = "des fonctionnalités",
}: {
  view: FeaturesView;
  expired: boolean;
  /** Ce qui se charge, avec son article (« des règles métier »). */
  noun?: string;
}): string {
  switch (view.kind) {
    case "loading":
      return `Chargement ${noun}…`;
    case "preparing":
      return expired ? "" : "Préparation de la spec en cours.";
    default:
      return "";
  }
}

/** La barre de compte, et avec elle la région d'état de l'écran, accompagne la liste et ses résultats vides. */
export const showsCountBar = (view: FeaturesView): boolean =>
  view.kind === "list" || view.kind === "empty-filtered";

/** Annonce d'un résultat de recherche ou de filtre : « 12 fonctionnalités trouvées sur 1 000 », « Aucun résultat… ». */
export function searchResultText(options: {
  q: string | undefined;
  filtered: boolean;
  total: number;
  projectTotal: number | undefined;
}): string {
  const { q, filtered, total, projectTotal } = options;
  if (total === 0) {
    return q
      ? `Aucun résultat pour « ${q} »`
      : "Aucune fonctionnalité ne correspond à ces filtres.";
  }
  if (!q && !filtered) return "";
  const found = `${plural(total, "fonctionnalité")} ${total > 1 ? "trouvées" : "trouvée"}`;
  return projectTotal === undefined ? found : `${found} sur ${formatCount(projectTotal)}`;
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

export const PLACEMENT_TEXT: Partial<Record<Placement, string>> = {
  filtered: "Elle n'apparaît pas avec les filtres actuels.",
  more: "Utilisez « Charger la suite » pour la voir.",
};

/** Féminin (fonctionnalité `F-`, règle `R-`) ou masculin (rôle `RL-`, parcours `P-`) : accord des participes. */
export const feminineId = (specId: string | undefined): boolean =>
  specId === undefined || /^(F-|T-)/.test(specId) || /^R-\d/.test(specId);

/** « F-001 supprimée. » (sans titre) ou « F-004 « Titre » créée. » / « … enregistrée. » ; phrase propre si l'index a échoué. */
export function confirmationText(meta: WriteMeta, indexFailed: boolean): string {
  if (indexFailed)
    return "Votre modification a été enregistrée, mais la spec n'a pas pu être relue.";
  const e = feminineId(meta.specId) ? "e" : "";
  if (meta.kind === "delete") return `${meta.specId} supprimé${e}.`;
  return `${meta.specId} « ${meta.title} » ${meta.kind === "create" ? `créé${e}` : `enregistré${e}`}.`;
}

/**
 * Ce que les avis d'écriture de la page (confirmation, suivi lent, liste en retard) disent à la région d'état
 * quand la barre de compte la porte : ils sont affichés en blocs, mais seule cette région les annonce.
 */
export function writeNoticeText(write: FeatureWrite): string {
  const { saved } = write;
  if (write.phase === "saved" && saved) {
    const placement = saved.placement ? PLACEMENT_TEXT[saved.placement] : undefined;
    return [confirmationText(saved.meta, saved.indexFailed), placement].filter(Boolean).join(" ");
  }
  if (write.phase === "tracking" && write.slow) return SLOW_TEXT;
  return write.phase === "late" ? LATE_TEXT : "";
}
