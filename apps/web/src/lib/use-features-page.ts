"use client";

import { type RefObject, useEffect, useRef } from "react";
import { beginFeatureSession } from "./feature-draft.ts";
import { regionText, showsFilters, showsVersion, writeRegionText } from "./features-region.ts";
import { canReadRepos } from "./roles.ts";
import { useFeatureFormPanel } from "./use-feature-form-panel.ts";
import { useFeatureSheet } from "./use-feature-sheet.ts";
import { useFeatureWrite } from "./use-feature-submit.ts";
import { useAnnouncements, useRepoCreated } from "./use-features-actions.ts";
import { useFeaturesData } from "./use-features-data.ts";
import { useFilterActions, useMore } from "./use-features-list.ts";
import { useFeaturesUrl } from "./use-features-url.ts";
import { usePendingResume } from "./use-pending-save.ts";
import { useStorageScope } from "./use-storage-scope.ts";

/** Tout ce que l'écran des fonctionnalités pilote : données, adresse, annonces, liste, fiche et visibilités. */
export function useFeaturesPage(projectId: string) {
  const url = useFeaturesUrl();
  const data = useFeaturesData(projectId, { status: url.status, priority: url.priority });
  const { announcement, announce, moreShown } = useAnnouncements(data.view);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const more = useMore(data, moreShown);
  const write = useFeatureWrite({
    projectId,
    filters: () => ({ status: url.status, priority: url.priority }),
  });
  usePendingResume(projectId, data.role, write);
  const form = useFeatureFormPanel(url, data, write);
  const keepFocus = useRef(false);
  keepFocus.current = write.phase === "saved";
  useSavedFocus(write, form.open, data.features.items, titleRef);
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
    write,
    form,
    /** « Rouvrir le brouillon » après un échec arrivé formulaire fermé. */
    reopenDraft: () => {
      const meta = write.meta;
      if (meta && meta.kind !== "create" && meta.specId) form.openEdit(meta.specId);
      else form.openCreate();
    },
    keepFocus,
    announce,
    region: {
      text: [text, announcement, writeRegionText(write, form.open)].filter(Boolean).join(" "),
      /** Formulaire ouvert : la page est masquée aux lecteurs d'écran, la région d'état passe dans le panneau. */
      panelText: [announcement, writeRegionText(write, true)].filter(Boolean).join(" "),
      busy: view.kind === "loading",
    },
    showFilters: headReady && showsFilters(view),
    showVersion: headReady && showsVersion(view),
    sheetOpen: Boolean(url.feature) && view.kind === "list",
  };
}

/** Après un enregistrement : focus sur le lien de la ligne enregistrée, ou sur le titre de la page (§5.6). */
function useSavedFocus(
  write: ReturnType<typeof useFeatureWrite>,
  formOpen: boolean,
  items: { specId: string }[],
  titleRef: RefObject<HTMLHeadingElement | null>,
): void {
  const done = useRef<string | null>(null);
  const { saved } = write;
  const specId = saved?.meta.specId;
  const rowShown = items.some((item) => item.specId === specId);
  useEffect(() => {
    if (!saved?.placement || formOpen) return;
    const key = `${saved.meta.target}:${saved.commitSha}`;
    const toRow = saved.placement === "row";
    if (done.current === key || (toRow && !rowShown)) return;
    const link = toRow
      ? document.querySelector<HTMLElement>(`[data-feature-link="${specId}"]`)
      : null;
    (link ?? titleRef.current)?.focus();
    done.current = key;
  }, [saved, formOpen, rowShown, specId, titleRef]);
}

export type FeaturesPageModel = ReturnType<typeof useFeaturesPage>;
