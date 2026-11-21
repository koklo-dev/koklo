"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  type ArchitectureTab,
  type ArchitectureUrlPatch,
  readArchitectureUrl,
  withArchitectureUrl,
} from "./architecture-tab.ts";

function write(patch: ArchitectureUrlPatch, mode: "push" | "replace"): void {
  const { pathname, search } = window.location;
  const url = `${pathname}${withArchitectureUrl(search, patch)}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Onglet, relecture, recherche, zone, composant, section et formulaire, lus dans l'adresse (`useSearchParams`) et écrits
 * par l'API History : le formulaire et la relecture s'empilent (Retour les ferme), la recherche, la zone, la section et
 * l'onglet remplacent l'entrée courante.
 */
export function useArchitectureUrl() {
  const search = useSearchParams().toString();
  const state = useMemo(() => readArchitectureUrl(search), [search]);
  return {
    ...state,
    search,
    setTab: useCallback((tab: ArchitectureTab) => write({ tab }, "replace"), []),
    setZone: useCallback((zone: string | null) => write({ zone, c: null }, "replace"), []),
    setQuery: useCallback((q: string | null) => write({ q, c: null }, "replace"), []),
    setSection: useCallback((s: string | null) => write({ s }, "replace"), []),
    /** Ouverture automatique au chargement : remplace l'entrée courante (pas de « Retour » vers un état sans relecture). */
    autoOpenReview: useCallback(() => write({ review: true }, "replace"), []),
    openReview: useCallback(() => write({ review: true, new: null, edit: null }, "push"), []),
    /** « Quitter la relecture » : retire `view` et l'onglet Relecture. */
    closeReview: useCallback(() => write({ review: null }, "replace"), []),
    openCreate: useCallback(
      () => write({ new: true, edit: null, c: null, tab: "components" }, "push"),
      [],
    ),
    openEdit: useCallback(
      (specId: string) => write({ edit: specId, new: null, c: null }, "push"),
      [],
    ),
    /** Ferme le formulaire ; `c` rend la ligne choisie après un enregistrement. */
    closeForm: useCallback(
      (c?: string) => write({ new: null, edit: null, c: c ?? null }, "replace"),
      [],
    ),
    /** Ouvre l'onglet Composants sur la ligne d'un composant (lien de l'avis d'enregistrement). */
    openComponent: useCallback(
      (c: string) => write({ tab: "components", c, review: null }, "push"),
      [],
    ),
    dropSelection: useCallback(() => write({ c: null }, "replace"), []),
  };
}

export type ArchitectureUrlModel = ReturnType<typeof useArchitectureUrl>;
