"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  readTechnicalUrl,
  type TechnicalTab,
  type TechnicalUrlPatch,
  withTechnicalUrl,
} from "./technical-tab.ts";

function write(patch: TechnicalUrlPatch, mode: "push" | "replace"): void {
  const { pathname, search } = window.location;
  const url = `${pathname}${withTechnicalUrl(search, patch)}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Onglet, relecture, choix, section, recherche et formulaire, lus dans l'adresse et écrits par l'API History : le
 * formulaire et la relecture s'empilent (Retour les ferme), le reste remplace l'entrée courante.
 */
export function useTechnicalUrl() {
  const search = useSearchParams().toString();
  const state = useMemo(() => readTechnicalUrl(search), [search]);
  return {
    ...state,
    search,
    setTab: useCallback((tab: TechnicalTab) => write({ tab }, "replace"), []),
    select: useCallback((sel: string | null) => write({ sel }, "replace"), []),
    setSection: useCallback((s: string | null) => write({ s }, "replace"), []),
    setQuery: useCallback((q: string | null) => write({ q, sel: null }, "replace"), []),
    openCreate: useCallback(() => write({ new: true, edit: null }, "push"), []),
    /** « Écrire à la main » et « Nouveau choix » : la feuille s'ouvre sur l'onglet demandé. */
    openCreateOn: useCallback(
      (tab: TechnicalTab) => write({ new: true, edit: null, tab }, "push"),
      [],
    ),
    openEdit: useCallback((edit: string) => write({ edit, new: null }, "push"), []),
    /** Ferme le formulaire ; un choix enregistré reste ouvert. */
    closeForm: useCallback((specId?: string) => {
      const sel = specId?.startsWith("ST-") ? { sel: specId } : {};
      write({ new: null, edit: null, ...sel }, "replace");
    }, []),
    autoOpenReview: useCallback(() => write({ review: true }, "replace"), []),
    openReview: useCallback(() => write({ review: true, new: null, edit: null }, "push"), []),
    closeReview: useCallback(() => write({ review: null }, "replace"), []),
  };
}

export type TechnicalUrlModel = ReturnType<typeof useTechnicalUrl>;
