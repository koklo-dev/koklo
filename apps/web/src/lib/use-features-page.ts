"use client";

import { type RefObject, useEffect, useRef } from "react";
import {
  regionText,
  searchResultText,
  showsCountBar,
  showsFilters,
  showsVersion,
  writeNoticeText,
  writeRegionText,
} from "./features-region.ts";
import type { FeaturesView } from "./features-view.ts";
import { canReadRepos, canWriteSpec } from "./roles.ts";
import { useFeatureFormPanel } from "./use-feature-form-panel.ts";
import { useFeatureSheet } from "./use-feature-sheet.ts";
import { useFeatureWrite } from "./use-feature-submit.ts";
import { useAnnouncements, useRepoCreated } from "./use-features-actions.ts";
import { useFeaturesData } from "./use-features-data.ts";
import {
  useFilterActions,
  useListFooter,
  useResultAnnouncement,
  useSearchBox,
} from "./use-features-list.ts";
import { useFeaturesUrl } from "./use-features-url.ts";
import { usePendingResume } from "./use-pending-save.ts";
import { useProposalLaunch } from "./use-proposal-launch.ts";
import { useProposalStatus } from "./use-proposal-status.ts";
import { useSavedToast } from "./use-saved-toast.ts";

/** Ce que la liste dit d'elle-même : barre de compte, résultat annoncé après la frappe, avis « hors des filtres ». */
function useListSummary(
  url: ReturnType<typeof useFeaturesUrl>,
  data: ReturnType<typeof useFeaturesData>,
) {
  const { features, head, view } = data;
  const filtered = Boolean(url.status || url.priority || url.q);
  const countBar = showsCountBar(view);
  const resultText = useResultAnnouncement(
    countBar
      ? searchResultText({
          q: url.q,
          filtered,
          total: features.total,
          projectTotal: head?.counts.features,
        })
      : "",
    !features.query.isFetching && !features.stale,
    features.items.length,
  );
  // Lien direct : la ligne ouverte n'est pas dans la liste filtrée (l'avis reste après la fermeture de la fiche).
  const outsideFilters =
    Boolean(data.around) &&
    filtered &&
    !features.query.isFetching &&
    features.query.data !== undefined &&
    !features.items.some((item) => item.specId === data.around);
  return { countBar, resultText, outsideFilters };
}

interface RegionParts {
  view: FeaturesView;
  expired: boolean;
  announcement: string;
  write: ReturnType<typeof useFeatureWrite>;
  formOpen: boolean;
  summary: ReturnType<typeof useListSummary>;
}

/** Textes de la région d'état de l'écran, selon qu'elle est celle de la page, de la barre de compte ou du panneau. */
function regionOf({ view, expired, announcement, write, formOpen, summary }: RegionParts) {
  const writeText = writeRegionText(write, formOpen);
  return {
    /** Texte de la région d'état de la page ; sous la barre de compte, il passe dans la sienne. */
    text: [regionText({ view, expired }), announcement, writeText].filter(Boolean).join(" "),
    /** Annonce portée par la barre de compte (seule région d'état quand la liste est affichée). */
    countText: [summary.resultText, announcement, writeText, writeNoticeText(write)]
      .filter(Boolean)
      .join(" "),
    /** Formulaire ouvert : la page est masquée aux lecteurs d'écran, la région d'état passe dans le panneau. */
    panelText: [announcement, writeRegionText(write, true)].filter(Boolean).join(" "),
    busy: view.kind === "loading",
    countBar: summary.countBar,
    /** Formulaire ouvert : la région d'état est celle du panneau, la page n'en porte pas une seconde. */
    showCount: summary.countBar && !formOpen,
  };
}

/**
 * Propositions de l'agent : bouton, modale et état du dernier lancement, pour l'équipe qui écrit sur une spec lue
 * seulement. Au chargement, un lancement à relire ouvre la relecture une fois (`replaceState`), jamais deux.
 */
function useProposals(
  projectId: string,
  url: ReturnType<typeof useFeaturesUrl>,
  data: ReturnType<typeof useFeaturesData>,
) {
  const enabled = canWriteSpec(data.role) && data.head?.status === "ready";
  const status = useProposalStatus(projectId, enabled);
  const launch = useProposalLaunch(projectId, status, { enabled, onLaunched: url.openReview });
  const checked = useRef(false);
  const { autoOpenReview } = url;
  const { loaded, active, counts } = status;
  useEffect(() => {
    if (!enabled || !loaded || checked.current) return;
    checked.current = true;
    if (!active && counts.pending > 0 && !url.review) autoOpenReview();
  }, [enabled, loaded, active, counts.pending, url.review, autoOpenReview]);
  return { enabled, status, launch, reviewing: enabled && Boolean(url.review) };
}

/** Tout ce que l'écran des fonctionnalités pilote : données, adresse, annonces, liste, fiche et visibilités. */
export function useFeaturesPage(projectId: string) {
  const url = useFeaturesUrl();
  const filters = { status: url.status, priority: url.priority, q: url.q };
  const data = useFeaturesData(projectId, { ...filters, selected: url.feature });
  const { announcement, announce } = useAnnouncements(data.view);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const footer = useListFooter(data.features);
  const write = useFeatureWrite({ projectId, filters: () => filters });
  usePendingResume(projectId, data.role, write);
  const form = useFeatureFormPanel(url, data, write);
  const keepFocus = useRef(false);
  keepFocus.current = write.phase === "saved";
  useSavedFocus(write, form.open, data.features.items, titleRef);
  useSavedToast(write);
  const { view, head } = data;
  const headReady = head !== null && head.status !== "failed";
  const summary = useListSummary(url, data);
  const propose = useProposals(projectId, url, data);

  return {
    propose,
    url,
    data,
    announcement,
    footer,
    search: useSearchBox(url),
    outsideFilters: summary.outsideFilters,
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
    region: regionOf({
      view,
      expired: data.expired,
      announcement,
      write,
      formOpen: form.open,
      summary,
    }),
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
