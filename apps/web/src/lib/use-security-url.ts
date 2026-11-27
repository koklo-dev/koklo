"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  readSecurityUrl,
  type SecurityTab,
  type SecurityUrlPatch,
  securityTargetOf,
  type ThreatFilter,
  withSecurityUrl,
} from "./security-tab.ts";

function write(patch: SecurityUrlPatch, mode: "push" | "replace"): void {
  const { pathname, search } = window.location;
  const url = `${pathname}${withSecurityUrl(search, patch)}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Onglet, relecture, sélection, filtres et formulaire, lus dans l'adresse et écrits par l'API History : le formulaire et
 * la relecture s'empilent (Retour les ferme), le reste remplace l'entrée courante.
 */
export function useSecurityUrl() {
  const search = useSearchParams().toString();
  const state = useMemo(() => readSecurityUrl(search), [search]);
  const { tab } = state;
  return {
    ...state,
    search,
    selectThreat: useCallback((threat: string | null) => write({ threat }, "replace"), []),
    setFilter: useCallback(
      (filter: ThreatFilter | null) => write({ filter, threat: null }, "replace"),
      [],
    ),
    setQuery: useCallback(
      (q: string | null) => write({ q, threat: null, data: null }, "replace"),
      [],
    ),
    clearSearch: useCallback(
      () => write({ q: null, filter: null, undecided: null, threat: null }, "replace"),
      [],
    ),
    setUndecided: useCallback(
      (undecided: boolean) => write({ undecided, data: null }, "replace"),
      [],
    ),
    setSection: useCallback((s: string | null) => write({ s }, "replace"), []),
    openElement: useCallback((specId: string) => write(securityTargetOf(specId), "replace"), []),
    openCreate: useCallback(() => write({ new: true, edit: null, data: null }, "push"), []),
    /** « Nouvelle menace » et « Classer une donnée » : la feuille s'ouvre sur l'onglet demandé. */
    openCreateOn: useCallback(
      (target: SecurityTab, data: string | null = null) =>
        write({ new: true, edit: null, tab: target, data }, "push"),
      [],
    ),
    openEdit: useCallback((edit: string) => write({ edit, new: null, data: null }, "push"), []),
    /** « Décider » : la feuille s'ouvre sur la ligne, la conservation au focus. */
    decide: useCallback(
      (field: string, entry: boolean) =>
        write({ data: field, new: entry ? null : true, edit: entry ? field : null }, "push"),
      [],
    ),
    /** Ferme le formulaire ; l'élément enregistré reste ouvert. */
    closeForm: useCallback((specId?: string) => {
      write(
        { new: null, edit: null, data: null, ...(specId ? securityTargetOf(specId) : {}) },
        "replace",
      );
    }, []),
    /** Un lancement à relire ouvre la relecture, sauf sur le Résumé où sa proposition se relit sur place (B806). */
    autoOpenReview: useCallback(() => {
      if (tab !== "summary") write({ review: true }, "replace");
    }, [tab]),
    openReview: useCallback(() => write({ review: true, new: null, edit: null }, "push"), []),
    closeReview: useCallback(() => write({ review: null }, "replace"), []),
  };
}

export type SecurityUrlModel = ReturnType<typeof useSecurityUrl>;
