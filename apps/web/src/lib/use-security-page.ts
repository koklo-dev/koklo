"use client";

import { useEffect, useRef } from "react";
import { regionText } from "./features-region.ts";
import { deriveFeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";
import { canReadRepos, canWriteSecurity } from "./roles.ts";
import { securityHeaderStateOf } from "./security-header-state.ts";
import { DATA_SAVED, LEVEL_SAVED, SUMMARY_SAVED, THREAT_SAVED } from "./security-labels.ts";
import type { SecurityUpstream } from "./security-stale.ts";
import { securityFormOf } from "./security-tab.ts";
import { type FeatureWrite, useFeatureWrite } from "./use-feature-submit.ts";
import { useAnnouncements, useRepoCreated } from "./use-features-actions.ts";
import { usePendingResume } from "./use-pending-save.ts";
import { useProposalReview } from "./use-proposal-review.ts";
import { useProposals } from "./use-proposals.ts";
import { useSavedToast } from "./use-saved-toast.ts";
import {
  countsOf,
  type SecurityTotals,
  useSecurityDocument,
  useSecurityTotals,
  writtenCount,
} from "./use-security-data.ts";
import { type SecurityUrlModel, useSecurityUrl } from "./use-security-url.ts";
import { useSpecDeliverables } from "./use-spec-deliverables.ts";
import { useSavedSync, useSpecForm } from "./use-spec-form.ts";
import { type SpecSources, useSpecSources } from "./use-spec-sources.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";
import { useDeliverableValidation, useValidateDeliverable } from "./use-validate-model.ts";

type Head = NonNullable<SpecSources["headData"]>;
const LIST_KEYS = [
  () => orpc.security.key(),
  () => orpc.spec.item.key(),
  () => orpc.spec.document.key(),
] as const;
const LIST_SYNC = [() => orpc.security.key(), () => orpc.spec.document.key()] as const;
const SETTLED = ["todo", "pending", "revise", "validated"] as const;
const NO_UPSTREAM: SecurityUpstream = { changes: [], items: [] };

/** Statut du livrable Sécurité (`spec.deliverables`), son ouverture et son impact amont. */
function useSecurityStatus(projectId: string) {
  const data = useSpecDeliverables(projectId).data;
  const entry = data?.deliverables.find((item) => item.key === "security");
  return {
    deliverable: SETTLED.find((value) => value === entry?.status),
    available: entry?.available,
    upstream: entry?.status === "revise" ? (entry.staleSecurity ?? NO_UPSTREAM) : NO_UPSTREAM,
  };
}

/** Totaux et état principal de l'écran (chargement, erreur, prêt, liste). */
function useSecurityView(projectId: string, sources: SpecSources) {
  const { role, head, repos } = sources;
  const readable = sources.readable && canReadRepos(role);
  const totals = useSecurityTotals(projectId, readable);
  const queries = Object.values(totals);
  const error = queries.find((query) => query.isError)?.error ?? null;
  const redirecting = useUnauthorizedRedirect(head.query.error ?? repos.error ?? error);
  const view = deriveFeaturesView({
    valid: sources.valid,
    roleKnown: sources.roleKnown,
    role,
    redirecting,
    filtered: false,
    head: head.query,
    repos,
    features: {
      data: queries.every((query) => query.data !== undefined) ? true : undefined,
      error,
      isError: error !== null,
      itemCount: writtenCount(totals),
      fetching: queries.some((query) => query.isFetching),
    },
  });
  return { totals, view, readable };
}

const SAVED_TEXT = { threat: THREAT_SAVED, sensitive: DATA_SAVED } as const;
/** Écritures faites sur place, sans feuille : leur cible dit ce qui s'annonce. */
export const IN_PLACE_SAVED: Record<string, string> = {
  "asvs-level": LEVEL_SAVED,
  summary: SUMMARY_SAVED,
};

/** Ce que la région d'état dit quand une écriture s'achève : l'élément enregistré. */
function useSavedAnnouncement(write: FeatureWrite, announce: (text: string) => void) {
  const { saved } = write;
  useEffect(() => {
    if (!saved || saved.meta.kind === "delete") return;
    const inPlace = IN_PLACE_SAVED[saved.meta.target];
    if (inPlace) return announce(inPlace);
    const id = saved.meta.specId;
    if (id) announce(SAVED_TEXT[securityFormOf(id, "threats")]);
  }, [saved, announce]);
}

/** Écriture : suivi du lot, formulaire ouvert par l'adresse, relecture après l'enregistrement, toast. */
function useSecurityWriting(
  projectId: string,
  url: SecurityUrlModel,
  sources: SpecSources,
  viewKind: string,
) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const write = useFeatureWrite({ projectId, filters: () => ({ q: url.q }) });
  usePendingResume(projectId, sources.role, write);
  const ready = sources.headData?.status === "ready";
  const form = useSpecForm(
    url,
    { role: sources.role, ready, viewKind, canWrite: canWriteSecurity },
    write,
  );
  useSavedSync(write, form.open, titleRef, LIST_SYNC);
  useSavedToast(write);
  return { titleRef, write, form };
}

/** Agent (lancement, relecture des propositions), validation et en-tête par état. */
function useSecurityProposing(ctx: {
  projectId: string;
  url: SecurityUrlModel;
  sources: SpecSources;
  totals: SecurityTotals;
  readable: boolean;
  viewKind: ReturnType<typeof useSecurityView>["view"]["kind"];
}) {
  const { projectId, url, sources, viewKind, readable } = ctx;
  const { role, headData } = sources;
  const propose = useProposals(
    projectId,
    url,
    { role, head: headData ?? null },
    { deliverable: "security", canPropose: canWriteSecurity },
  );
  const review = useProposalReview(projectId, propose.reviewing, "security");
  const status = useSecurityStatus(projectId);
  const validation = useDeliverableValidation(
    "security",
    projectId,
    readable && (status.deliverable === "validated" || status.deliverable === "revise"),
  );
  const generating = propose.status.active && propose.status.counts.total === 0;
  const header = securityHeaderStateOf({
    team: canReadRepos(role),
    canWrite: canWriteSecurity(role),
    agent: propose.enabled,
    reviewing: propose.reviewing,
    generating,
    pending: propose.status.counts.pending,
    accepted: propose.status.counts.accepted,
    viewKind,
    counts: countsOf(ctx.totals),
    deliverable: status.deliverable,
    validation,
    ...(status.available === undefined ? {} : { available: status.available }),
  });
  return { propose, review, header, generating, validation, ...status };
}

/** Tout ce que pilote la page Sécurité de l'équipe : données, adresse, annonces, relecture, formulaire, en-tête. */
export function useSecurityPage(projectId: string) {
  const url = useSecurityUrl();
  const sources = useSpecSources(projectId, LIST_KEYS);
  const { role, headData } = sources;
  const team = canReadRepos(role);
  const { totals, view, readable } = useSecurityView(projectId, sources);
  const { announcement, announce } = useAnnouncements(view);
  const writing = useSecurityWriting(projectId, url, sources, view.kind);
  useSavedAnnouncement(writing.write, announce);
  const proposing = useSecurityProposing({
    projectId,
    url,
    sources,
    totals,
    readable,
    viewKind: view.kind,
  });
  const validate = useValidateDeliverable("security", projectId, headData?.commitSha, announce);
  return {
    url,
    projectId,
    sources,
    view,
    role,
    team,
    readable,
    totals,
    head: (headData ?? null) as Head | null,
    document: useSecurityDocument(projectId, readable && url.tab === "doc"),
    ...writing,
    ...proposing,
    validate,
    announce,
    announcement,
    statusText: regionText({ view, expired: sources.head.expired, noun: "de la sécurité" }),
    repoCreated: useRepoCreated(announce),
    reopenDraft: () =>
      writing.form.specId ? writing.form.openEdit(writing.form.specId) : writing.form.openCreate(),
    expired: sources.head.expired,
    retryLoad: () => {
      if (headData === undefined) return void sources.head.query.refetch();
      for (const query of Object.values(totals)) void query.refetch();
    },
    refresh: () => {
      sources.head.restart();
      void sources.head.query.refetch();
    },
  };
}

export type SecurityPageModel = ReturnType<typeof useSecurityPage>;
