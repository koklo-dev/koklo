"use client";

import { useEffect, useRef } from "react";
import { proposedTableOf } from "./data-diagram.ts";
import { type DataHeaderInput, dataHeaderStateOf } from "./data-header-state.ts";
import { tablesResultText } from "./data-labels.ts";
import type { DiagramCard } from "./data-mermaid.ts";
import { regionText, writeNoticeText, writeRegionText } from "./features-region.ts";
import { deriveFeaturesView, type FeaturesView } from "./features-view.ts";
import { orpc } from "./orpc.ts";
import { canReadRepos, canWriteData } from "./roles.ts";
import { useDataTables } from "./use-data-tables.ts";
import { type DataUrl, useDataUrl } from "./use-data-url.ts";
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
import { useDataValidation, useValidateModel } from "./use-validate-model.ts";

type DataHead = NonNullable<SpecSources["headData"]>;
const LIST_KEYS = [() => orpc.spec.data.key(), () => orpc.spec.item.key()] as const;
const LIST_SYNC = [() => orpc.spec.data.key()] as const;

/** Tables proposées : cartes du diagramme, avec la décision de relecture de chacune et leurs relations. */
function proposedCards(review: ReturnType<typeof useProposalReview>): DiagramCard[] {
  // B397 : les relations ne sont pas dans la charge d'une table ; celles des propositions « relations » non rejetées
  // s'ajoutent à la carte de départ (B440).
  const links = review.proposals
    .filter((proposal) => proposal.kind === "relations" && proposal.status !== "rejected")
    .flatMap((proposal) => {
      const list = (proposal.content as { relations?: unknown }).relations;
      return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
    })
    .filter((link) => typeof link.from === "string" && typeof link.to === "string");
  return review.proposals
    .filter((proposal) => proposal.kind === "table")
    .map((proposal) => {
      const content = proposal.content as unknown as Parameters<typeof proposedTableOf>[0];
      // Zone de la table proposée, sinon celle de la proposition (B478).
      const card = proposedTableOf(
        { zone: proposal.zone || undefined, ...content },
        proposal.status,
      );
      const out = links
        .filter((link) => link.from === card.id)
        .map((link) => ({ to: String(link.to), cardinality: String(link.cardinality ?? "") }));
      return out.length > 0 ? { ...card, relations: [...(card.relations ?? []), ...out] } : card;
    });
}

/** Tables et jeux proposés, pour les compteurs d'onglet de la relecture. */
function proposedCountsOf(review: ReturnType<typeof useProposalReview>) {
  const count = (kind: string) => review.proposals.filter((p) => p.kind === kind).length;
  return { tables: count("table"), fixtures: count("fixtures") };
}

/** Tables du modèle et état principal de l'écran (chargement, erreur, vide, liste) d'après `spec.head`, les dépôts et la liste. */
function useDataView(projectId: string, url: DataUrl, sources: SpecSources) {
  const { role, head, repos, readable } = sources;
  const deepLink = useDeepLink(url.sel, `${url.q}|${url.zone}`);
  const tables = useDataTables({
    projectId,
    q: url.q,
    zone: url.zone,
    around: deepLink.around,
    enabled: readable && canReadRepos(role),
  });
  const dropAround = deepLink.drop;
  const { aroundMissing } = tables;
  useEffect(() => {
    if (aroundMissing) dropAround();
  }, [aroundMissing, dropAround]);
  const redirecting = useUnauthorizedRedirect(
    head.query.error ?? repos.error ?? tables.query.error,
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
      ...tables.query,
      isError: tables.query.isError && !aroundMissing,
      itemCount: tables.items.length,
      fetching: tables.query.isFetching,
    },
  });
  return { tables, view };
}

type Deliverables = ReturnType<typeof useSpecDeliverables>["data"];
const SETTLED = ["todo", "pending", "revise", "validated"] as const;

/** Fonctionnalités et règles modifiées depuis la dernière décision (`staleUpstream`, B449) ; vide hors « À revoir ». */
function upstreamOf(data: Deliverables): readonly string[] {
  const entry = data?.deliverables.find((item) => item.key === "data");
  return entry?.status === "revise" ? (entry.staleUpstream ?? []) : [];
}

/** Statut du livrable Données (`spec.deliverables`) : celui de l'état Liste. */
function dataDeliverableStatus(data: Deliverables): DataHeaderInput["deliverable"] {
  const status = data?.deliverables.find((item) => item.key === "data")?.status;
  return SETTLED.find((value) => value === status);
}

/** En-tête de l'écran par état (statut, résumé, actions, compteurs d'onglet). */
function useDataHeader(
  page: {
    team: boolean;
    role: string | undefined;
    view: FeaturesView;
    url: DataUrl;
    head: DataHead | null;
    propose: ReturnType<typeof useProposals>;
    proposed: { tables: number; fixtures: number };
  },
  projectId: string,
) {
  const { propose, head } = page;
  const deliverables = useSpecDeliverables(projectId);
  const deliverable = dataDeliverableStatus(deliverables.data);
  const validation = useDataValidation(projectId, page.team && deliverable === "validated");
  const generating = propose.status.active && propose.status.counts.total === 0;
  const counts = head
    ? {
        tables: head.counts.tables,
        relations: head.counts.relations,
        fixtures: head.counts.fixtures,
      }
    : undefined;
  const header = dataHeaderStateOf({
    team: page.team,
    canWrite: canWriteData(page.role),
    agent: propose.enabled,
    reviewing: propose.reviewing,
    generating,
    pending: propose.status.counts.pending,
    proposedTables: page.proposed.tables,
    proposedFixtures: page.proposed.fixtures,
    viewKind: page.view.kind,
    tab: page.url.tab,
    counts,
    deliverable,
    validation,
  });
  return { header, generating, upstream: upstreamOf(deliverables.data) };
}

interface RegionInput {
  view: FeaturesView;
  url: DataUrl;
  expired: boolean;
  announcement: string;
  write: FeatureWrite;
  formOpen: boolean;
  resultText: string;
}

/** Textes de la région d'état : celle de la page, de la barre de compte de l'onglet Tables ou du panneau. */
function regionOf({ view, url, expired, announcement, write, formOpen, resultText }: RegionInput) {
  const writeText = writeRegionText(write, formOpen);
  const countBar = view.kind === "list" || view.kind === "empty-filtered";
  return {
    text: [regionText({ view, expired, noun: "du modèle de données" }), writeText]
      .filter(Boolean)
      .join(" "),
    /** Annonce pour les lecteurs d'écran seulement : la maquette 11 n'affiche rien au-dessus du fil. */
    srText: announcement,
    countText: [resultText, announcement, writeText, writeNoticeText(write)]
      .filter(Boolean)
      .join(" "),
    panelText: [announcement, writeRegionText(write, true)].filter(Boolean).join(" "),
    busy: view.kind === "loading",
    /** La barre de compte de l'onglet Tables porte la région d'état ; ailleurs, celle de la page. */
    showCount: countBar && url.tab === "tables" && !formOpen,
  };
}

/** Écriture d'une table : suivi du lot, formulaire ouvert par l'adresse, relecture après l'enregistrement, toast. */
function useDataWriting(projectId: string, url: DataUrl, sources: SpecSources, view: FeaturesView) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const write = useFeatureWrite({ projectId, filters: () => ({ q: url.q }) });
  usePendingResume(projectId, sources.role, write);
  const ready = sources.headData?.status === "ready";
  const form = useSpecForm(
    url,
    { role: sources.role, ready, viewKind: view.kind, canWrite: canWriteData },
    write,
  );
  useSavedSync(write, form.open, titleRef, LIST_SYNC);
  useSavedToast(write);
  return { titleRef, write, form };
}

/** Annonce du résultat d'une recherche ou d'un filtre de l'onglet Tables, après la frappe. */
function useTablesResult(
  url: DataUrl,
  tables: ReturnType<typeof useDataTables>,
  view: FeaturesView,
  projectTotal: number | undefined,
): string {
  const countBar = view.kind === "list" || view.kind === "empty-filtered";
  return useResultAnnouncement(
    countBar
      ? tablesResultText({ q: url.q, zone: url.zone, total: tables.total, projectTotal })
      : "",
    !tables.query.isFetching && !tables.stale,
    tables.items.length,
  );
}

interface ListParts {
  tables: ReturnType<typeof useDataTables>;
  view: FeaturesView;
  sources: SpecSources;
  write: FeatureWrite;
  form: { open: boolean };
  announce: (text: string) => void;
  announcement: string;
}

/** Ce que l'onglet Tables lit de la page : pied de liste, recherche, dépôt créé et textes de la région d'état. */
function useDataList(url: DataUrl, parts: ListParts) {
  const { tables, view, sources, write, form, announce, announcement } = parts;
  const resultText = useTablesResult(url, tables, view, sources.headData?.counts.tables);
  return {
    footer: useListFooter(tables, () => orpc.spec.data.key()),
    search: useSearchBox(url),
    repoCreated: useRepoCreated(announce),
    region: regionOf({
      view,
      url,
      expired: sources.head.expired,
      announcement,
      write,
      formOpen: form.open,
      resultText,
    }),
  };
}

/** Agent (lancement, relecture des propositions) et en-tête par état : statut, actions, impact amont. */
function useDataProposing(ctx: {
  projectId: string;
  url: DataUrl;
  sources: SpecSources;
  view: FeaturesView;
}) {
  const { projectId, url, sources, view } = ctx;
  const { role, headData } = sources;
  const propose = useProposals(
    projectId,
    url,
    { role, head: headData ?? null },
    { deliverable: "data", canPropose: canWriteData },
  );
  const review = useProposalReview(projectId, propose.reviewing, "data");
  const header = useDataHeader(
    {
      team: canReadRepos(role),
      role,
      view,
      url,
      head: headData ?? null,
      propose,
      proposed: proposedCountsOf(review),
    },
    projectId,
  );
  return { propose, review, ...header };
}

/** Tout ce que pilote l'écran Données : données, adresse, annonces, relecture, formulaire, en-tête et visibilités. */
export function useDataPage(projectId: string) {
  const url = useDataUrl();
  const sources = useSpecSources(projectId, LIST_KEYS);
  const { role, headData } = sources;
  const team = canReadRepos(role);
  const { tables, view } = useDataView(projectId, url, sources);
  const { announcement, announce } = useAnnouncements(view);
  const { titleRef, write, form } = useDataWriting(projectId, url, sources, view);
  const { propose, review, header, generating, upstream } = useDataProposing({
    projectId,
    url,
    sources,
    view,
  });
  return {
    url,
    projectId,
    sources,
    view,
    role,
    team,
    head: headData ?? null,
    tables,
    write,
    form,
    propose,
    review,
    generating,
    header,
    upstream,
    validate: useValidateModel(projectId, headData?.commitSha, announce),
    titleRef,
    announce,
    ...useDataList(url, { tables, view, sources, write, form, announce, announcement }),
    proposed: proposedCards(review),
    reopenDraft: () => (form.specId ? form.openEdit(form.specId) : form.openCreate()),
    expired: sources.head.expired,
    retryLoad: () =>
      void (headData === undefined ? sources.head.query.refetch() : tables.query.refetch()),
    refresh: () => {
      sources.head.restart();
      void sources.head.query.refetch();
    },
  };
}

export type DataPageModel = ReturnType<typeof useDataPage>;
