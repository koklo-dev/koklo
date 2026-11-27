"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  readTechnicalUrl,
  type TechnicalTab,
  type TechnicalUrlPatch,
  technicalSelectionOf,
  technicalTargetOf,
  withTechnicalUrl,
} from "./technical-tab.ts";

function write(patch: TechnicalUrlPatch, mode: "push" | "replace"): void {
  const { pathname, search } = window.location;
  const url = `${pathname}${withTechnicalUrl(search, patch)}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Onglet, relecture, sélection (choix, opération, exigence, section), filtres et formulaire, lus dans l'adresse et écrits
 * par l'API History : le formulaire et la relecture s'empilent (Retour les ferme), le reste remplace l'entrée courante.
 */
export function useTechnicalUrl() {
  const search = useSearchParams().toString();
  const state = useMemo(() => readTechnicalUrl(search), [search]);
  return {
    ...state,
    search,
    setTab: useCallback((tab: TechnicalTab) => write({ tab }, "replace"), []),
    select: useCallback((sel: string | null) => write({ sel }, "replace"), []),
    openElement: useCallback((specId: string) => write(technicalTargetOf(specId), "replace"), []),
    setSection: useCallback((s: string | null) => write({ s }, "replace"), []),
    selectOperation: useCallback((op: string | null) => write({ op }, "replace"), []),
    setZone: useCallback((zone: string | null) => write({ zone, op: null }, "replace"), []),
    clearSearch: useCallback(() => write({ q: null, zone: null, op: null }, "replace"), []),
    setQuery: useCallback((q: string | null) => write({ q, sel: null, op: null }, "replace"), []),
    openCreate: useCallback(() => write({ new: true, edit: null }, "push"), []),
    /** « Écrire à la main » et « Nouveau choix » : la feuille s'ouvre sur l'onglet demandé. */
    openCreateOn: useCallback(
      (tab: TechnicalTab) => write({ new: true, edit: null, tab }, "push"),
      [],
    ),
    openEdit: useCallback((edit: string) => write({ edit, new: null }, "push"), []),
    /** Ferme le formulaire ; l'élément enregistré (choix, opération, exigence) reste ouvert. */
    closeForm: useCallback((specId?: string) => {
      write({ new: null, edit: null, ...technicalSelectionOf(specId) }, "replace");
    }, []),
    autoOpenReview: useCallback(() => write({ review: true }, "replace"), []),
    openReview: useCallback(() => write({ review: true, new: null, edit: null }, "push"), []),
    closeReview: useCallback(() => write({ review: null }, "replace"), []),
  };
}

export type TechnicalUrlModel = ReturnType<typeof useTechnicalUrl>;
