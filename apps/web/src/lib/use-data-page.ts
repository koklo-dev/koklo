"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef } from "react";
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
import { type SpecSources, useSpecSources } from "./use-spec-sources.ts";
import { useUnauthorizedRedirect } from "./use-unauthorized-redirect.ts";

type DataHead = NonNullable<SpecSources["headData"]>;
const LIST_KEYS = [() => orpc.spec.data.key(), () => orpc.spec.item.key()] as const;
/** Vues où la spec est lue et le formulaire peut s'ouvrir. */
const WRITABLE_VIEWS = ["list", "empty", "empty-filtered"];

/**
 * Ouverture du formulaire par l'adresse (`?new=1`, `?edit=T-slug`) : seulement pour qui écrit les Données (le designer
 * lit) et quand `spec.head` est prêt ; sinon le paramètre est retiré. Une écriture terminée le referme.
 */
function useDataForm(
  url: DataUrl,
  ctx: { role: string | undefined; ready: boolean; viewKind: string },
  write: FeatureWrite,
) {
  const { role, ready, viewKind } = ctx;
  const canWrite = canWriteData(role) && ready && WRITABLE_VIEWS.includes(viewKind);
  const wanted = url.new || Boolean(url.edit);
  const { closeForm } = url;
  useEffect(() => {
    if (role !== undefined && !canWriteData(role) && wanted) closeForm();
  }, [role, wanted, closeForm]);
  const open = canWrite && wanted;
  const saved = write.saved;
  useEffect(() => {
    if (open && write.phase === "saved") {
      closeForm(saved?.meta.kind === "delete" ? undefined : saved?.meta.specId);
    }
  }, [open, write.phase, saved, closeForm]);
  return {
    canWrite,
    open,
    mode: url.edit ? ("edit" as const) : ("create" as const),
    specId: url.edit,
    close: () => closeForm(),
    openCreate: () => {
      write.dismiss();
      url.openCreate();
    },
    openEdit: (specId: string) => {
      write.dismiss();
      url.openEdit(specId);
    },
  };
}

/** Après un enregistrement : les lectures se relisent, puis le focus va à la ligne enregistrée ou au titre de la page. */
function useSavedSync(
  write: FeatureWrite,
  formOpen: boolean,
  titleRef: RefObject<HTMLHeadingElement | null>,
) {
  const queryClient = useQueryClient();
  const done = useRef<string | null>(null);
  const { saved } = write;
  useEffect(() => {
    if (!saved?.commitSha || formOpen) return;
    const key = `${saved.meta.target}:${saved.commitSha}`;
    if (done.current === key) return;
    done.current = key;
    const specId = saved.meta.kind === "delete" ? undefined : saved.meta.specId;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.spec.data.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.spec.item.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.spec.head.key() }),
    ]).then(() => {
      const row = specId
        ? document.querySelector<HTMLElement>(`[data-spec-id="${specId}"] button`)
        : null;
      (row ?? titleRef.current)?.focus();
    });
  }, [saved, formOpen, queryClient, titleRef]);
}

/** Tables, relations et jeux proposés par l'agent : cartes du diagramme, avec la décision de relecture de chacune. */
function proposedCards(review: ReturnType<typeof useProposalReview>): DiagramCard[] {
  return review.proposals
    .filter((proposal) => proposal.kind === "table")
    .map((proposal) =>
      proposedTableOf(
        proposal.content as unknown as Parameters<typeof proposedTableOf>[0],
        proposal.status,
      ),
    );
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
    deliverable: dataDeliverableStatus(deliverables.data),
  });
  return { header, generating };
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
    text: [regionText({ view, expired, noun: "du modèle de données" }), announcement, writeText]
      .filter(Boolean)
      .join(" "),
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
  const form = useDataForm(url, { role: sources.role, ready, viewKind: view.kind }, write);
  useSavedSync(write, form.open, titleRef);
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

/** Tout ce que pilote l'écran Données : données, adresse, annonces, relecture, formulaire, en-tête et visibilités. */
export function useDataPage(projectId: string) {
  const url = useDataUrl();
  const sources = useSpecSources(projectId, LIST_KEYS);
  const { role, headData } = sources;
  const team = canReadRepos(role);
  const { tables, view } = useDataView(projectId, url, sources);
  const { announcement, announce } = useAnnouncements(view);
  const { titleRef, write, form } = useDataWriting(projectId, url, sources, view);
  const propose = useProposals(
    projectId,
    url,
    { role, head: headData ?? null },
    {
      deliverable: "data",
      canPropose: canWriteData,
    },
  );
  const review = useProposalReview(projectId, propose.reviewing, "data");
  const { header, generating } = useDataHeader(
    {
      team,
      role,
      view,
      url,
      head: headData ?? null,
      propose,
      proposed: proposedCountsOf(review),
    },
    projectId,
  );
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
