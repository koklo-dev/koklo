"use client";

import { type useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorCode } from "./api-error.ts";
import { QUERY_MAX_LENGTH } from "./features-url.ts";
import { orpc } from "./orpc.ts";
import type { useFeaturesUrl } from "./use-features-url.ts";

type Url = ReturnType<typeof useFeaturesUrl>;

/** Ce que le pied de liste lit d'une liste paginée : les fonctionnalités, les règles ou les parcours. */
interface PagedList {
  query: Pick<
    ReturnType<typeof useInfiniteQuery>,
    | "isFetchingNextPage"
    | "isFetchNextPageError"
    | "isFetchingPreviousPage"
    | "fetchNextPage"
    | "fetchPreviousPage"
    | "error"
  >;
  items: readonly unknown[];
  hasNext: boolean;
  hasPrevious: boolean;
}

export type FooterState = "more" | "loading" | "error" | "end";

/** Délai de la saisie avant la requête (200 ms) et de l'annonce du résultat (500 ms) : jamais à chaque lettre. */
const SEARCH_DELAY_MS = 200;
const ANNOUNCE_DELAY_MS = 500;
/** Au-delà de deux écrans de lignes, « Revenir en haut » apparaît en fin de liste. */
const LONG_LIST_ROWS = 20;

/** Pied de liste : « Charger la suite », chargement, erreur de suite (curseur périmé : reprise depuis le début), fin. */
export function useListFooter(
  features: PagedList,
  listKey: () => readonly unknown[] = () => orpc.spec.listFeatures.key(),
) {
  const queryClient = useQueryClient();
  const { query } = features;
  const state: FooterState = query.isFetchingNextPage
    ? "loading"
    : query.isFetchNextPageError
      ? "error"
      : features.hasNext
        ? "more"
        : "end";
  const { fetchNextPage, fetchPreviousPage, isFetchingNextPage, isFetchingPreviousPage } = query;
  const { hasNext, hasPrevious } = features;
  return {
    state,
    longList: features.items.length > LONG_LIST_ROWS,
    hasNext,
    hasPrevious,
    loading: isFetchingNextPage,
    onLoadMore: useCallback(() => {
      if (hasNext && !isFetchingNextPage) void fetchNextPage();
    }, [hasNext, isFetchingNextPage, fetchNextPage]),
    onLoadPrevious: useCallback(() => {
      if (hasPrevious && !isFetchingPreviousPage) void fetchPreviousPage();
    }, [hasPrevious, isFetchingPreviousPage, fetchPreviousPage]),
    onRetry: () => {
      if (errorCode(query.error) === "VALIDATION") {
        void queryClient.resetQueries({ queryKey: listKey() });
      } else void fetchNextPage();
    },
  };
}

/** Filtres : le changement efface l'annonce et relance la requête ; « Effacer » rend le focus au premier `Select`. */
export function useFilterActions(url: Url, announce: (text: string) => void) {
  const statusRef = useRef<HTMLButtonElement>(null);
  return {
    statusRef,
    onChange: (patch: Parameters<Url["setFilters"]>[0]) => {
      announce("");
      url.setFilters(patch);
    },
    onClear: () => {
      announce("");
      url.setFilters({ status: null, priority: null, validation: null });
      statusRef.current?.focus();
    },
  };
}

/**
 * Champ de recherche : la saisie est locale, l'adresse (`?q=`) la suit après 200 ms. Un changement venu d'ailleurs
 * (« Effacer la recherche », retour arrière) remplace le texte ; la saisie en cours n'est jamais écrasée.
 */
export function useSearchBox(url: Url) {
  const [text, setText] = useState(url.q ?? "");
  const written = useRef(url.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setQuery } = url;

  useEffect(() => {
    const current = url.q ?? "";
    if (current === written.current) return;
    written.current = current;
    setText(current);
  }, [url.q]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if (event.key !== "/" || typing || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const write = useCallback(
    (value: string) => {
      const next = value.trim().slice(0, QUERY_MAX_LENGTH);
      written.current = next;
      setQuery(next || null);
    },
    [setQuery],
  );
  return {
    text,
    inputRef,
    onChange: (value: string) => {
      setText(value);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => write(value), SEARCH_DELAY_MS);
    },
    clear: () => {
      clearTimeout(timer.current);
      setText("");
      write("");
      inputRef.current?.focus();
    },
  };
}

/**
 * Résultat de la recherche annoncé 500 ms après qu'il s'est stabilisé, une fois par couple (recherche, total).
 * L'arrivée d'une page suivante efface l'annonce pour laisser la place à celle de la barre de compte.
 */
export function useResultAnnouncement(text: string, settled: boolean, loaded: number): string {
  const [announced, setAnnounced] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `loaded` ne sert qu'à effacer l'annonce quand une page arrive
  useEffect(() => setAnnounced(""), [loaded]);
  useEffect(() => {
    if (!text || !settled) return;
    const timer = setTimeout(() => setAnnounced(text), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, settled]);
  return announced === text ? announced : "";
}
