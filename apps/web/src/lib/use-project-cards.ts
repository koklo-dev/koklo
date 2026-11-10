"use client";

import type { ProjectCardsInput } from "@koklo/contract";
import { PROJECT_CARDS_PAGE_SIZE } from "@koklo/contract";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { orpc } from "./orpc.ts";
import { DEFAULT_SORT, type ProjectsUrl } from "./projects-url.ts";

/** Entrée de `project.cards` pour l'état de l'adresse : une valeur par défaut n'est pas envoyée. */
export function cardsInput(url: ProjectsUrl, cursor: string | undefined): ProjectCardsInput {
  return {
    ...(url.q ? { q: url.q } : {}),
    ...(url.phase ? { phase: url.phase } : {}),
    ...(url.sort !== DEFAULT_SORT ? { sort: url.sort } : {}),
    limit: PROJECT_CARDS_PAGE_SIZE,
    ...(cursor ? { cursor } : {}),
  };
}

/** Cartes de projet par pages de 24 (curseur du serveur) ; l'ancienne page reste affichée pendant un changement de filtre. */
export function useProjectCards(url: ProjectsUrl) {
  return useInfiniteQuery({
    ...orpc.project.cards.infiniteOptions({
      input: (cursor: string | undefined) => cardsInput(url, cursor),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
    placeholderData: keepPreviousData,
  });
}

/**
 * Appelle `onVisible` quand l'élément approche du bas de la fenêtre (marge de 20 % de la hauteur). Sans
 * `IntersectionObserver` (tests, vieux navigateurs), rien ne se déclenche : « Charger la suite » reste là.
 */
export function useBottomSentinel(onVisible: () => void, enabled: boolean) {
  const target = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const node = target.current;
    if (!enabled || !node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { rootMargin: "0px 0px 20% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);
  return target;
}
