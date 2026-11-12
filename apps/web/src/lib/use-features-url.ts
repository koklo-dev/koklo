"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { readFeaturesTab } from "./features-tab.ts";
import {
  type FeaturesUrlPatch,
  readFeaturesUrl,
  withFeaturesTab,
  withFeaturesUrl,
} from "./features-url.ts";

function write(patch: FeaturesUrlPatch, mode: "push" | "replace"): void {
  const { pathname, search } = window.location;
  const url = `${pathname}${withFeaturesTab(withFeaturesUrl(search, patch), readFeaturesTab(search))}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Filtres, recherche, fiche et formulaire ouverts, lus dans l'adresse (`useSearchParams`) et écrits par l'API History :
 * la fiche et le formulaire s'empilent (Retour les ferme), les filtres et la recherche remplacent l'entrée courante.
 * Un lien en `?feature=F-001` (ancien nom de `?sel=`) est réécrit en `?sel=` au chargement.
 */
export function useFeaturesUrl() {
  const search = useSearchParams().toString();
  const state = useMemo(() => readFeaturesUrl(search), [search]);
  useEffect(() => {
    if (new URLSearchParams(search).has("feature") && state.feature) {
      const feature = state.feature;
      // Après les effets du routeur : réécrit trop tôt, l'entrée d'historique perdrait l'état de Next et « Retour » ne la relirait pas.
      queueMicrotask(() => write({ feature }, "replace"));
    }
  }, [search, state.feature]);
  return {
    ...state,
    search,
    setFilters: useCallback((patch: FeaturesUrlPatch) => write(patch, "replace"), []),
    setQuery: useCallback((q: string | null) => write({ q }, "replace"), []),
    openFeature: useCallback((feature: string) => write({ feature }, "push"), []),
    /** Ouverture automatique au chargement : remplace l'entrée courante (pas de « Retour » vers la liste vide). */
    autoOpenReview: useCallback(() => write({ review: true }, "replace"), []),
    openReview: useCallback(() => write({ review: true, new: null, edit: null }, "push"), []),
    /** « Quitter la relecture » : retire le paramètre sans rouvrir la relecture dans la même session. */
    closeReview: useCallback(() => write({ review: null }, "replace"), []),
    closeFeature: useCallback(() => write({ feature: null }, "replace"), []),
    openCreate: useCallback(() => write({ new: true, edit: null, feature: null }, "push"), []),
    openEdit: useCallback(
      (specId: string) => write({ edit: specId, new: null, feature: null }, "push"),
      [],
    ),
    /** Ferme le formulaire ; `feature` rend la fiche d'où venait la modification. */
    closeForm: useCallback(
      (feature?: string) => write({ new: null, edit: null, feature: feature ?? null }, "replace"),
      [],
    ),
    /** Sans droit d'écriture : `?edit=F-001` devient la fiche en lecture. */
    showFeature: useCallback(
      (feature: string) => write({ edit: null, new: null, feature }, "replace"),
      [],
    ),
  };
}
