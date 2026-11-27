"use client";

import type { SpecDeliverable } from "@koklo/contract";
import { useEffect, useRef } from "react";
import { regionText } from "./features-region.ts";
import { deriveFeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";
import { canReadRepos, canWriteTechnical } from "./roles.ts";
import { technicalHeaderStateOf } from "./technical-header-state.ts";
import { CHOICE_SAVED, ENVIRONMENT_SAVED } from "./technical-labels.ts";
import { type FeatureWrite, useFeatureWrite } from "./use-feature-submit.ts";
import { useDeepLink } from "./use-features.ts";
import { useAnnouncements, useRepoCreated } from "./use-features-actions.ts";
import { useListFooter, useSearchBox } from "./use-features-list.ts";
import { usePendingResume } from "./use-pending-save.ts";
import { useProposalReview } from "./use-proposal-review.ts";
import { useProposals } from "./use-proposals.ts";
import { useSavedToast } from "./use-saved-toast.ts";
import { useSpecDeliverables } from "./use-spec-deliverables.ts";
import { useSavedSync, useSpecForm } from "./use-spec-form.ts";
import { type SpecSources, useSpecSources } from "./use-spec-sources.ts";
import {
  useStackTotals,
  useTechnicalDocument,
  useTechnicalEnvironments,
  useTechnicalStack,
} from "./use-technical-data.ts";
import { type TechnicalUrlModel, useTechnicalUrl } from "./use-technical-url.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";
import { useDeliverableValidation } from "./use-validate-model.ts";

type Head = NonNullable<SpecSources["headData"]>;
const LIST_KEYS = [
  () => orpc.spec.technical.key(),
  () => orpc.spec.item.key(),
  () => orpc.spec.document.key(),
] as const;
const LIST_SYNC = [() => orpc.spec.technical.key(), () => orpc.spec.document.key()] as const;
const SETTLED = ["todo", "pending", "revise", "validated"] as const;

/** Changements d'architecture d'un cahier « À revoir » (`staleTechnical`) ; vide sinon. */
export type TechnicalUpstream = NonNullable<SpecDeliverable["staleTechnical"]>;
const NO_UPSTREAM: TechnicalUpstream = { changes: [], items: [] };

/** Statut du livrable Technique (`spec.deliverables`), son ouverture et son impact amont. */
function useTechnicalStatus(projectId: string) {
  const data = useSpecDeliverables(projectId).data;
  const entry = data?.deliverables.find((item) => item.key === "technical");
  return {
    deliverable: SETTLED.find((value) => value === entry?.status),
    available: entry?.available,
    upstream: entry?.status === "revise" ? (entry.staleTechnical ?? NO_UPSTREAM) : NO_UPSTREAM,
  };
}

/** Opérations et exigences enregistrées : sans choix ni environnement, le cahier n'est pas « Prêt » pour autant. */
const otherEntries = (head: SpecSources["headData"]): number =>
  (head?.counts.endpoints ?? 0) + (head?.counts.nfr ?? 0);

/** Choix, environnements et état principal de l'écran (chargement, erreur, vide, liste). */
function useTechnicalView(projectId: string, url: TechnicalUrlModel, sources: SpecSources) {
  const { role, head, repos } = sources;
  const readable = sources.readable && canReadRepos(role);
  const deepLink = useDeepLink(url.sel, url.q ?? "");
  const stack = useTechnicalStack({
    projectId,
    q: url.q,
    around: deepLink.around,
    enabled: readable,
  });
  const environments = useTechnicalEnvironments(projectId, readable);
  const dropAround = deepLink.drop;
  const { aroundMissing } = stack;
  // Un choix introuvable (lien périmé) : on repart de la première page.
  useEffect(() => {
    if (aroundMissing) dropAround();
  }, [aroundMissing, dropAround]);
  const stackFailed = stack.query.isError && !aroundMissing;
  const error = (stackFailed ? stack.query.error : null) ?? environments.error;
  const redirecting = useUnauthorizedRedirect(head.query.error ?? repos.error ?? error);
  const loaded = stack.query.data !== undefined && environments.data !== undefined;
  const view = deriveFeaturesView({
    valid: sources.valid,
    roleKnown: sources.roleKnown,
    role,
    redirecting,
    filtered: Boolean(url.q),
    head: head.query,
    repos,
    features: {
      data: loaded ? true : undefined,
      error,
      isError: stackFailed || environments.isError,
      itemCount:
        stack.items.length +
        (environments.data?.environments.length ?? 0) +
        (url.q ? 0 : otherEntries(sources.headData)),
      fetching: stack.query.isFetching || environments.isFetching,
    },
  });
  return { stack, environments, view };
}

/** Ce que la région d'état dit quand une écriture s'achève : le choix ou l'environnement enregistré. */
function useSavedAnnouncement(write: FeatureWrite, announce: (text: string) => void) {
  const { saved } = write;
  useEffect(() => {
    if (!saved || saved.meta.kind === "delete") return;
    const id = saved.meta.specId ?? "";
    if (id.startsWith("ENV-")) announce(ENVIRONMENT_SAVED);
    else if (id.startsWith("ST-")) announce(CHOICE_SAVED);
  }, [saved, announce]);
}

/** Écriture : suivi du lot, formulaire ouvert par l'adresse, relecture après l'enregistrement, toast. */
function useTechnicalWriting(
  projectId: string,
  url: TechnicalUrlModel,
  sources: SpecSources,
  viewKind: string,
) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const write = useFeatureWrite({ projectId, filters: () => ({ q: url.q }) });
  usePendingResume(projectId, sources.role, write);
  const ready = sources.headData?.status === "ready";
  const form = useSpecForm(
    url,
    { role: sources.role, ready, viewKind, canWrite: canWriteTechnical },
    write,
  );
  useSavedSync(write, form.open, titleRef, LIST_SYNC);
  useSavedToast(write);
  return { titleRef, write, form };
}

function countsOf(head: SpecSources["headData"], open: number) {
  if (!head) return undefined;
  const { stack, endpoints, nfr, environments } = head.counts;
  return {
    choices: stack ?? 0,
    operations: endpoints ?? 0,
    requirements: nfr ?? 0,
    environments: environments ?? 0,
    open,
  };
}

/** Agent (lancement, relecture des propositions) et en-tête par état. */
function useTechnicalProposing(ctx: {
  projectId: string;
  url: TechnicalUrlModel;
  sources: SpecSources;
  viewKind: ReturnType<typeof useTechnicalView>["view"]["kind"];
}) {
  const { projectId, url, sources, viewKind } = ctx;
  const { role, headData } = sources;
  const propose = useProposals(
    projectId,
    url,
    { role, head: headData ?? null },
    { deliverable: "technical", canPropose: canWriteTechnical },
  );
  const review = useProposalReview(projectId, propose.reviewing, "technical");
  const status = useTechnicalStatus(projectId);
  const readable = canReadRepos(role) && sources.readable;
  const totals = useStackTotals(projectId, readable);
  const validation = useDeliverableValidation(
    "technical",
    projectId,
    readable && (status.deliverable === "validated" || status.deliverable === "revise"),
  );
  const generating = propose.status.active && propose.status.counts.total === 0;
  const header = technicalHeaderStateOf({
    team: canReadRepos(role),
    canWrite: canWriteTechnical(role),
    agent: propose.enabled,
    reviewing: propose.reviewing,
    generating,
    pending: propose.status.counts.pending,
    viewKind,
    tab: url.tab,
    counts: countsOf(headData, totals.open),
    deliverable: status.deliverable,
    validation,
    ...(status.available === undefined ? {} : { available: status.available }),
  });
  return { propose, review, header, generating, totals, validation, ...status };
}

/** Tout ce que pilote la page Technique de l'équipe : données, adresse, annonces, relecture, formulaire, en-tête. */
export function useTechnicalPage(projectId: string) {
  const url = useTechnicalUrl();
  const sources = useSpecSources(projectId, LIST_KEYS);
  const { role, headData } = sources;
  const team = canReadRepos(role);
  const { stack, environments, view } = useTechnicalView(projectId, url, sources);
  const { announcement, announce } = useAnnouncements(view);
  const writing = useTechnicalWriting(projectId, url, sources, view.kind);
  useSavedAnnouncement(writing.write, announce);
  const proposing = useTechnicalProposing({ projectId, url, sources, viewKind: view.kind });
  return {
    url,
    projectId,
    sources,
    view,
    role,
    team,
    head: (headData ?? null) as Head | null,
    stack,
    environments,
    document: useTechnicalDocument(projectId, sources.readable && team && url.tab === "document"),
    ...writing,
    ...proposing,
    announce,
    announcement,
    statusText: regionText({ view, expired: sources.head.expired, noun: "du cahier technique" }),
    footer: useListFooter(stack, () => orpc.spec.technical.stack.key()),
    search: useSearchBox(url),
    repoCreated: useRepoCreated(announce),
    reopenDraft: () =>
      writing.form.specId ? writing.form.openEdit(writing.form.specId) : writing.form.openCreate(),
    expired: sources.head.expired,
    retryLoad: () => {
      if (headData === undefined) return void sources.head.query.refetch();
      void stack.query.refetch();
      void environments.refetch();
    },
    refresh: () => {
      sources.head.restart();
      void sources.head.query.refetch();
    },
  };
}

export type TechnicalPageModel = ReturnType<typeof useTechnicalPage>;
