"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { errorCode } from "./api-error.ts";
import { withFeaturesUrl } from "./features-url.ts";
import { orpc } from "./orpc.ts";
import { canReadRepos } from "./roles.ts";
import { counterText, useAnnouncements, useRepoCreated } from "./use-features-actions.ts";
import { useFeaturesData } from "./use-features-data.ts";
import { useFeaturesUrl } from "./use-features-url.ts";

/** Vues où le projet a une spec lisible : filtres et ligne de version ont un sens. */
const FILTERED_VIEWS = ["loading", "list", "empty-filtered", "error"];
const VERSIONED_VIEWS = ["loading", "list", "empty", "empty-filtered"];

type Data = ReturnType<typeof useFeaturesData>;
type Url = ReturnType<typeof useFeaturesUrl>;

/** Texte de la région d'état unique de l'écran (chargement, compteur, vide filtré, préparation). */
function regionText(data: Data, filtered: boolean, hasNext: boolean): string {
  const { view, head, features } = data;
  switch (view.kind) {
    case "loading":
      return "Chargement des fonctionnalités…";
    case "list":
      return counterText({
        filtered,
        total: head?.counts.features,
        shown: features.items.length,
        hasNext,
      });
    case "empty-filtered":
      return "Aucune fonctionnalité ne correspond à ces filtres.";
    case "preparing":
      return data.expired ? "" : "Préparation de la spec en cours.";
    default:
      return "";
  }
}

function moreFailure(failed: boolean, error: unknown): "validation" | "other" | null {
  if (!failed) return null;
  return errorCode(error) === "VALIDATION" ? "validation" : "other";
}

/** « Afficher plus » : page suivante, annonce du nombre réel, reprise depuis le début si le curseur est périmé. */
function useMore(data: Data, moreShown: (count: number) => void) {
  const queryClient = useQueryClient();
  const { query } = data.features;
  return {
    hasNext: Boolean(query.hasNextPage),
    fetching: query.isFetchingNextPage,
    failure: moreFailure(query.isFetchNextPageError, query.error),
    onMore: () => {
      void query.fetchNextPage().then((result) => {
        const last = result.data?.pages.at(-1);
        if (!result.isError && last) moreShown(last.items.length);
      });
    },
    onRestart: () => void queryClient.resetQueries({ queryKey: orpc.spec.listFeatures.key() }),
  };
}

/** Filtres : le changement efface l'annonce et relance la requête ; « Effacer » rend le focus au premier `Select`. */
function useFilterActions(url: Url, announce: (text: string) => void) {
  const statusRef = useRef<HTMLButtonElement>(null);
  return {
    statusRef,
    onChange: (patch: Parameters<Url["setFilters"]>[0]) => {
      announce("");
      url.setFilters(patch);
    },
    onClear: () => {
      announce("");
      url.setFilters({ status: null, priority: null });
      statusRef.current?.focus();
    },
  };
}

/** Tout ce que l'écran des fonctionnalités pilote : données, adresse, annonces, actions et visibilités. */
export function useFeaturesPage(projectId: string) {
  const url = useFeaturesUrl();
  const data = useFeaturesData(projectId, { status: url.status, priority: url.priority });
  const queryClient = useQueryClient();
  const { announcement, announce, moreShown } = useAnnouncements(data.view);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const more = useMore(data, moreShown);
  const filters = useFilterActions(url, announce);
  const { view, head } = data;
  const filtered = Boolean(url.status || url.priority);
  const headReady = head !== null && head.status !== "failed";

  return {
    url,
    data,
    announcement,
    more,
    filters,
    titleRef,
    team: canReadRepos(data.role),
    repoCreated: useRepoCreated(announce),
    region: {
      text: [regionText(data, filtered, more.hasNext), announcement].filter(Boolean).join(" "),
      busy: view.kind === "loading",
    },
    showFilters: headReady && FILTERED_VIEWS.includes(view.kind),
    showVersion: headReady && VERSIONED_VIEWS.includes(view.kind),
    sheetOpen: Boolean(url.feature) && view.kind === "list",
    hrefFor: (specId: string) =>
      `/projects/${projectId}/features${withFeaturesUrl(`?${url.search}`, { feature: specId })}`,
    returnFocus: useCallback((specId: string) => {
      const link = document.querySelector<HTMLElement>(`[data-feature-link="${specId}"]`);
      (link ?? titleRef.current)?.focus();
    }, []),
    refetchList: useCallback(
      () => void queryClient.invalidateQueries({ queryKey: orpc.spec.listFeatures.key() }),
      [queryClient],
    ),
  };
}

export type FeaturesPageModel = ReturnType<typeof useFeaturesPage>;
