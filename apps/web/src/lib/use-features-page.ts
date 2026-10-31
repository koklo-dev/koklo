"use client";

import { useRef } from "react";
import { regionText, showsFilters, showsVersion } from "./features-region.ts";
import { canReadRepos } from "./roles.ts";
import { useFeatureSheet } from "./use-feature-sheet.ts";
import { useAnnouncements, useRepoCreated } from "./use-features-actions.ts";
import { useFeaturesData } from "./use-features-data.ts";
import { useFilterActions, useMore } from "./use-features-list.ts";
import { useFeaturesUrl } from "./use-features-url.ts";

/** Tout ce que l'écran des fonctionnalités pilote : données, adresse, annonces, liste, fiche et visibilités. */
export function useFeaturesPage(projectId: string) {
  const url = useFeaturesUrl();
  const data = useFeaturesData(projectId, { status: url.status, priority: url.priority });
  const { announcement, announce, moreShown } = useAnnouncements(data.view);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const more = useMore(data, moreShown);
  const { view, head } = data;
  const headReady = head !== null && head.status !== "failed";
  const text = regionText({
    view,
    expired: data.expired,
    filtered: Boolean(url.status || url.priority),
    total: head?.counts.features,
    shown: data.features.items.length,
    hasNext: more.hasNext,
  });

  return {
    url,
    data,
    announcement,
    more,
    filters: useFilterActions(url, announce),
    titleRef,
    team: canReadRepos(data.role),
    repoCreated: useRepoCreated(announce),
    sheet: useFeatureSheet(projectId, url, titleRef),
    region: {
      text: [text, announcement].filter(Boolean).join(" "),
      busy: view.kind === "loading",
    },
    showFilters: headReady && showsFilters(view),
    showVersion: headReady && showsVersion(view),
    sheetOpen: Boolean(url.feature) && view.kind === "list",
  };
}

export type FeaturesPageModel = ReturnType<typeof useFeaturesPage>;
