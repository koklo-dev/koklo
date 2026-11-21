"use client";

import { useEffect, useRef } from "react";
import {
  type ArchitectureHeaderInput,
  architectureHeaderStateOf,
} from "./architecture-header-state.ts";
import { componentsResultText } from "./architecture-labels.ts";
import { regionText, writeNoticeText, writeRegionText } from "./features-region.ts";
import { deriveFeaturesView, type FeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";
import { canReadRepos, canWriteArchitecture } from "./roles.ts";
import { useArchitectureComponents } from "./use-architecture-components.ts";
import { useArchitectureChecks, useArchitectureDocument } from "./use-architecture-document.ts";
import { useFlowCount } from "./use-architecture-flows.ts";
import { type ArchitectureUrlModel, useArchitectureUrl } from "./use-architecture-url.ts";
import { type FeatureWrite, useFeatureWrite } from "./use-feature-submit.ts";
import { useDeepLink } from "./use-features.ts";
import { useAnnouncements, useRepoCreated } from "./use-features-actions.ts";
import { useListFooter, useResultAnnouncement, useSearchBox } from "./use-features-list.ts";
import { usePendingResume } from "./use-pending-save.ts";
import { useProposalReview } from "./use-proposal-review.ts";
import { useProposals } from "./use-proposals.ts";
import { useSavedToast } from "./use-saved-toast.ts";
import { useSpecDeliverables } from "./use-spec-deliverables.ts";
import { useSavedSync, useSpecForm } from "./use-spec-form.ts";
import { type SpecSources, useSpecSources } from "./use-spec-sources.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

type Head = NonNullable<SpecSources["headData"]>;
const LIST_KEYS = [() => orpc.spec.architecture.key(), () => orpc.spec.item.key()] as const;
const LIST_SYNC = [() => orpc.spec.architecture.key()] as const;
const SETTLED = ["todo", "pending", "revise", "validated"] as const;

/** Composants du projet et état principal de l'écran (chargement, erreur, vide, liste) d'après `spec.head`, les dépôts et la liste. */
function useArchitectureView(projectId: string, url: ArchitectureUrlModel, sources: SpecSources) {
  const { role, head, repos, readable } = sources;
  const deepLink = useDeepLink(url.c, `${url.q}|${url.zone}`);
  const components = useArchitectureComponents({
    projectId,
    q: url.q,
    zone: url.zone,
    around: deepLink.around,
    enabled: readable && canReadRepos(role),
  });
  const dropAround = deepLink.drop;
  const { aroundMissing } = components;
  useEffect(() => {
    if (aroundMissing) dropAround();
  }, [aroundMissing, dropAround]);
  const redirecting = useUnauthorizedRedirect(
    head.query.error ?? repos.error ?? components.query.error,
  );
  const view = deriveFeaturesView({
    valid: sources.valid,
    roleKnown: sources.roleKnown,
    role,
    redirecting,
    filtered: Boolean(url.q || url.zone),
    head: head.query,
    repos,
    features: {
      ...components.query,
      isError: components.query.isError && !aroundMissing,
      itemCount: components.items.length,
      fetching: components.query.isFetching,
    },
  });
  return { components, view };
}

/** Écriture d'un composant : suivi du lot, formulaire ouvert par l'adresse, relecture après l'enregistrement, toast. */
function useArchitectureWriting(
  projectId: string,
  url: ArchitectureUrlModel,
  sources: SpecSources,
  view: FeaturesView,
) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const write = useFeatureWrite({ projectId, filters: () => ({ q: url.q }) });
  usePendingResume(projectId, sources.role, write);
  const ready = sources.headData?.status === "ready";
  const form = useSpecForm(
    url,
    { role: sources.role, ready, viewKind: view.kind, canWrite: canWriteArchitecture },
    write,
  );
  useSavedSync(write, form.open, titleRef, LIST_SYNC);
  useSavedToast(write);
  return { titleRef, write, form };
}

interface RegionInput {
  view: FeaturesView;
  url: ArchitectureUrlModel;
  expired: boolean;
  announcement: string;
  write: FeatureWrite;
  formOpen: boolean;
  resultText: string;
}

/** Textes de la région d'état : celle de la page, de la barre de compte de l'onglet Composants ou du panneau. */
function regionOf({ view, url, expired, announcement, write, formOpen, resultText }: RegionInput) {
  const writeText = writeRegionText(write, formOpen);
  const countBar = view.kind === "list" || view.kind === "empty-filtered";
  return {
    text: [regionText({ view, expired, noun: "de l'architecture" }), writeText]
      .filter(Boolean)
      .join(" "),
    srText: announcement,
    countText: [resultText, announcement, writeText, writeNoticeText(write)]
      .filter(Boolean)
      .join(" "),
    panelText: [announcement, writeRegionText(write, true)].filter(Boolean).join(" "),
    busy: view.kind === "loading",
    /** La barre de compte de l'onglet Composants porte la région d'état ; ailleurs, celle de la page. */
    showCount: countBar && url.tab === "components" && !formOpen,
  };
}

/** Ce que l'onglet Composants lit de la page : pied de liste, recherche, annonce du résultat, dépôt créé, région d'état. */
function useComponentsList(
  url: ArchitectureUrlModel,
  parts: {
    components: ReturnType<typeof useArchitectureComponents>;
    view: FeaturesView;
    sources: SpecSources;
    write: FeatureWrite;
    formOpen: boolean;
    announce: (text: string) => void;
    announcement: string;
  },
) {
  const { components, view, sources, write, formOpen, announce, announcement } = parts;
  const countBar = view.kind === "list" || view.kind === "empty-filtered";
  const resultText = useResultAnnouncement(
    countBar
      ? componentsResultText({
          q: url.q,
          zone: url.zone,
          total: components.total,
          projectTotal: sources.headData?.counts.components,
        })
      : "",
    !components.query.isFetching && !components.stale,
    components.items.length,
  );
  return {
    footer: useListFooter(components, () => orpc.spec.architecture.key()),
    search: useSearchBox(url),
    repoCreated: useRepoCreated(announce),
    region: regionOf({
      view,
      url,
      expired: sources.head.expired,
      announcement,
      write,
      formOpen,
      resultText,
    }),
  };
}

/** Statut du livrable Architecture (`spec.deliverables`) : celui de l'état Liste. */
function useArchitectureStatus(projectId: string) {
  const data = useSpecDeliverables(projectId).data;
  const status = data?.deliverables.find((item) => item.key === "architecture")?.status;
  return SETTLED.find((value) => value === status);
}

/** Agent (lancement, relecture des propositions) et en-tête par état : statut, actions, compteurs d'onglet. */
function useArchitectureProposing(ctx: {
  projectId: string;
  url: ArchitectureUrlModel;
  sources: SpecSources;
  view: FeaturesView;
}) {
  const { projectId, url, sources, view } = ctx;
  const { role, headData } = sources;
  const propose = useProposals(
    projectId,
    url,
    { role, head: headData ?? null },
    { deliverable: "architecture", canPropose: canWriteArchitecture },
  );
  const review = useProposalReview(projectId, propose.reviewing, "architecture");
  const deliverable = useArchitectureStatus(projectId);
  const flows = useFlowCount(projectId, canReadRepos(role) && sources.readable);
  const generating = propose.status.active && propose.status.counts.total === 0;
  // Le total du groupe « Composants » du lancement, pas les seules propositions chargées (8 par groupe au-delà de 30).
  const proposedComponents = propose.status.groups
    .filter((group) => group.key.split(":")[0] === "component")
    .reduce((total, group) => total + group.total, 0);
  const header = architectureHeaderStateOf({
    team: canReadRepos(role),
    canWrite: canWriteArchitecture(role),
    agent: propose.enabled,
    reviewing: propose.reviewing,
    generating,
    pending: propose.status.counts.pending,
    proposedComponents,
    viewKind: view.kind,
    tab: url.tab,
    counts: headData
      ? { components: headData.counts.components, ...(flows === undefined ? {} : { flows }) }
      : undefined,
    deliverable,
  } satisfies ArchitectureHeaderInput);
  return { propose, review, header, generating, proposedComponents };
}

/** Tout ce que pilote l'écran Architecture : données, adresse, annonces, relecture, formulaire, en-tête et visibilités. */
export function useArchitecturePage(projectId: string) {
  const url = useArchitectureUrl();
  const sources = useSpecSources(projectId, LIST_KEYS);
  const { role, headData } = sources;
  const team = canReadRepos(role);
  const { components, view } = useArchitectureView(projectId, url, sources);
  const { announcement, announce } = useAnnouncements(view);
  const { titleRef, write, form } = useArchitectureWriting(projectId, url, sources, view);
  const proposing = useArchitectureProposing({ projectId, url, sources, view });
  const readable = sources.readable && team;
  return {
    url,
    projectId,
    sources,
    view,
    role,
    team,
    head: (headData ?? null) as Head | null,
    components,
    write,
    form,
    ...proposing,
    document: useArchitectureDocument(projectId, readable && url.tab === "document"),
    checks: useArchitectureChecks(projectId, readable && proposing.propose.reviewing),
    titleRef,
    announce,
    ...useComponentsList(url, {
      components,
      view,
      sources,
      write,
      formOpen: form.open,
      announce,
      announcement,
    }),
    reopenDraft: () => (form.specId ? form.openEdit(form.specId) : form.openCreate()),
    expired: sources.head.expired,
    retryLoad: () =>
      void (headData === undefined ? sources.head.query.refetch() : components.query.refetch()),
    refresh: () => {
      sources.head.restart();
      void sources.head.query.refetch();
    },
  };
}

export type ArchitecturePageModel = ReturnType<typeof useArchitecturePage>;
