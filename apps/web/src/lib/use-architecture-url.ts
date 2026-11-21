"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  type ArchitectureTab,
  type ArchitectureUrlPatch,
  readArchitectureUrl,
  withArchitectureUrl,
} from "./architecture-tab.ts";
import { NARROW_MAX, useMaxWidth } from "./use-max-width.ts";

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
  // Sous 1024 px l'onglet par défaut est Composants (B548) ; un `tab=` explicite prime.
  const wide = !useMaxWidth(NARROW_MAX);
  const state = useMemo(() => readArchitectureUrl(search, wide), [search, wide]);
  return {
    ...state,
    search,
    setTab: useCallback((tab: ArchitectureTab) => write({ tab }, "replace"), []),
    setZone: useCallback((zone: string | null) => write({ zone, c: null }, "replace"), []),
    /** Schéma : ouvre une zone (libellé) et, au choix, un nœud ; `null` revient à la vue des zones. */
    openZone: useCallback(
      (zone: string | null, sel?: string) => write({ zone, sel: sel ?? null, c: null }, "replace"),
      [],
    ),
    /** Nœud choisi dans le schéma : sans entrée d'historique (il survit à un remontage du lecteur). */
    select: useCallback((sel: string) => write({ sel }, "replace"), []),
    selectFlow: useCallback((f: string | null) => write({ f }, "replace"), []),
    openCreateFlow: useCallback(
      () => write({ new: true, edit: null, f: null, tab: "flows" }, "push"),
      [],
    ),
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
    dropSelection: useCallback(() => write({ c: null, sel: null }, "replace"), []),
  };
}

export type ArchitectureUrlModel = ReturnType<typeof useArchitectureUrl>;
