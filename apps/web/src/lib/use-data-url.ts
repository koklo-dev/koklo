"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { type DataTab, type DataUrlPatch, readDataUrl, withDataUrl } from "./data-tab.ts";

function write(patch: DataUrlPatch, mode: "push" | "replace"): void {
  const { pathname, search } = window.location;
  const url = `${pathname}${withDataUrl(search, patch)}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Onglet, relecture, recherche, zone, table ouverte et formulaire, lus dans l'adresse (`useSearchParams`) et écrits
 * par l'API History : le formulaire et la relecture s'empilent (Retour les ferme), la recherche, la zone et l'onglet
 * remplacent l'entrée courante.
 */
export function useDataUrl() {
  const search = useSearchParams().toString();
  const state = useMemo(() => readDataUrl(search), [search]);
  return {
    ...state,
    search,
    setTab: useCallback((tab: DataTab) => write({ tab }, "replace"), []),
    setZone: useCallback((zone: string | null) => write({ zone, sel: null }, "replace"), []),
    setQuery: useCallback((q: string | null) => write({ q, sel: null }, "replace"), []),
    /** Ouverture automatique au chargement : remplace l'entrée courante (pas de « Retour » vers un état sans relecture). */
    autoOpenReview: useCallback(() => write({ review: true }, "replace"), []),
    openReview: useCallback(() => write({ review: true, new: null, edit: null }, "push"), []),
    /** « Quitter la relecture » : retire `view` et l'onglet Relecture. */
    closeReview: useCallback(() => write({ review: null }, "replace"), []),
    openCreate: useCallback(() => write({ new: true, edit: null, sel: null }, "push"), []),
    openEdit: useCallback(
      (specId: string) => write({ edit: specId, new: null, sel: null }, "push"),
      [],
    ),
    /** Ferme le formulaire ; `sel` rend la ligne choisie après un enregistrement. */
    closeForm: useCallback(
      (sel?: string) => write({ new: null, edit: null, sel: sel ?? null }, "replace"),
      [],
    ),
    /** Ouvre un onglet Tables sur la ligne d'une table (lien de l'avis d'enregistrement). */
    openTable: useCallback(
      (sel: string) => write({ tab: "tables", sel, review: null }, "push"),
      [],
    ),
    dropSelection: useCallback(() => write({ sel: null }, "replace"), []),
  };
}

export type DataUrl = ReturnType<typeof useDataUrl>;
