"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { type ProjectsUrlPatch, readProjectsUrl, withProjectsUrl } from "./projects-url.ts";

/**
 * Recherche, phase et tri de `/projects`, lus dans l'adresse (`useSearchParams`) et écrits par l'API History
 * (remplacement de l'entrée courante : un filtre n'empile pas l'historique).
 */
export function useProjectsUrl() {
  const search = useSearchParams().toString();
  const state = useMemo(() => readProjectsUrl(search), [search]);
  const patch = useCallback((change: ProjectsUrlPatch) => {
    const { pathname, search: current, hash } = window.location;
    window.history.replaceState(null, "", `${pathname}${withProjectsUrl(current, change)}${hash}`);
  }, []);
  return { ...state, patch };
}

export type ProjectsUrlState = ReturnType<typeof useProjectsUrl>;
