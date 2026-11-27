"use client";

import { OPERATION_PAGE_SIZE } from "@koklo/contract";
import {
  Button,
  EmptyState,
  FilterChip,
  formatCount,
  ListFooter,
  OperationRow,
  SearchField,
  Skeleton,
} from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { errorCode } from "../lib/api-error.ts";
import { rateLimitedReadText } from "../lib/git-read-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { pendingUpdatesOf } from "../lib/proposal-technical.ts";
import {
  LIST_ERROR_TEXT,
  NO_OPERATION_TEXT,
  NO_OPERATION_TITLE,
  OPERATION_ERROR_TITLE,
  OPERATION_NOUN,
  OPERATION_SEARCH_LABEL,
  OPERATION_SEARCH_PLACEHOLDER,
  OPERATION_SORT,
  OPERATIONS_ERROR_TITLE,
  permissionShortOf,
} from "../lib/technical-api-labels.ts";
import { useAutoLoad } from "../lib/use-auto-load.ts";
import { useListFooter, type useSearchBox } from "../lib/use-features-list.ts";
import { PHONE_MAX, useMaxWidth } from "../lib/use-max-width.ts";
import { type OperationListModel, useOperations } from "../lib/use-technical-api.ts";
import type { TechnicalPageModel } from "../lib/use-technical-page.ts";
import type { TechnicalUrlModel } from "../lib/use-technical-url.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { BackToList } from "./architecture-decision-list.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { TechnicalFichePanel } from "./technical-fiche-panel.tsx";
import { OperationFiche } from "./technical-operation-fiche.tsx";
import { usePressedChoice } from "./technical-stack-tab.tsx";

const PANEL_CLASS = "flex min-w-0 flex-[999_1_480px] flex-col gap-3.5 border-l px-7 pt-1 pb-8";

export interface OperationBrowserProps {
  url: TechnicalUrlModel;
  list: OperationListModel;
  search: ReturnType<typeof useSearchBox>;
  /** Barre de compte absente tant qu'une feuille est ouverte (une seule région d'état). */
  countBar?: boolean;
  announcement?: string;
  proposedIds?: readonly string[];
  /** « Nouvelle opération » d'une liste vide (équipe qui écrit). */
  onCreate?: (() => void) | undefined;
  detail: (opId: string) => ReactNode;
}

const plural = (count: number): string =>
  `${formatCount(count)} ${count >= 2 ? OPERATION_NOUN.other : OPERATION_NOUN.one}`;

/** Zones de la facette, dans l'ordre de la liste ; la zone filtrée reste affichée même sans résultat. */
function ZoneFilter({ url, list }: Pick<OperationBrowserProps, "url" | "list">) {
  const { zones } = list;
  const names = [...new Set([...Object.keys(zones), ...(url.zone ? [url.zone] : [])])].sort();
  const total = Object.values(zones).reduce((sum, count) => sum + count, 0);
  const chips = [
    { zone: null, label: `Toutes · ${formatCount(total)}` },
    ...names.map((zone) => ({ zone, label: `${zone} · ${formatCount(zones[zone] ?? 0)}` })),
  ];
  return (
    // biome-ignore lint/a11y/useSemanticElements: groupe de filtres, pas un jeu de champs de formulaire
    <div role="group" aria-label="Filtrer par zone" className="flex flex-wrap gap-1.5">
      {chips.map(({ zone, label }) => (
        <FilterChip
          key={zone ?? ""}
          variant="zone"
          className="max-md:h-11"
          pressed={(url.zone ?? null) === zone}
          onPressedChange={() => url.setZone(zone)}
        >
          {label}
        </FilterChip>
      ))}
    </div>
  );
}

function Counts({ list }: Pick<OperationBrowserProps, "list">) {
  const loaded = list.items.length;
  return (
    <>
      <span className="font-semibold text-foreground">{plural(list.total)}</span>
      <span>{loaded < list.total ? `· ${formatCount(loaded)} chargées` : "· toutes chargées"}</span>
      <span className="flex-1" />
      <span>{OPERATION_SORT}</span>
    </>
  );
}

/** Barre de compte : région d'état de l'onglet, présente dès l'attente pour que ses annonces soient lues. */
function CountBar({ list, announcement }: Pick<OperationBrowserProps, "list" | "announcement">) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground"
    >
      {list.query.data ? <Counts list={list} /> : null}
      {announcement ? <span className="sr-only">{announcement}</span> : null}
    </div>
  );
}

function Empty({ url, onCreate }: Pick<OperationBrowserProps, "url" | "onCreate">) {
  if (url.q || url.zone) {
    return (
      <EmptyState
        variant="inline"
        bordered
        icon="search_off"
        title={
          url.q
            ? `Aucune opération ne correspond à « ${url.q} »`
            : "Aucune opération ne correspond à cette zone"
        }
        description="La recherche porte sur toutes les opérations du projet."
        action={
          <Button variant="outline" size="sm" className="max-md:h-11" onClick={url.clearSearch}>
            Effacer la recherche
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      variant="inline"
      bordered
      icon="api"
      title={NO_OPERATION_TITLE}
      description={NO_OPERATION_TEXT}
      {...(onCreate
        ? {
            action: (
              <Button variant="outline" size="sm" className="max-md:h-11" onClick={onCreate}>
                Nouvelle opération
              </Button>
            ),
          }
        : {})}
    />
  );
}

function Footer({ list }: { list: OperationListModel }) {
  const footer = useListFooter(list, () => orpc.spec.technical.ops.key());
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  return (
    <div ref={sentinel}>
      <ListFooter
        state={footer.state}
        pageSize={OPERATION_PAGE_SIZE}
        loadedCount={list.items.length}
        total={list.total}
        noun={OPERATION_NOUN}
        longList={footer.longList}
        className="px-3.5 py-2.5 text-caption font-normal"
        onLoadMore={footer.onLoadMore}
        onRetry={footer.onRetry}
        onBackToTop={() => sentinel.current?.parentElement?.scrollTo({ top: 0 })}
      />
    </div>
  );
}

type RowsProps = Pick<OperationBrowserProps, "url" | "list" | "proposedIds"> & {
  selected: string | undefined;
};

/** Cadre de la liste (maquette 14 l.228-234) : lignes, suite et pied, défilement interne dès 768 px. */
function Rows({ url, list, selected, proposedIds = [] }: RowsProps) {
  return (
    <div className="overflow-auto rounded-xl border border-border md:max-h-[680px]">
      {list.hasPrevious ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full max-md:h-11"
          onClick={() => void list.query.fetchPreviousPage()}
        >
          Charger les précédentes
        </Button>
      ) : null}
      <div>
        {list.items.map((item) => (
          <OperationRow
            key={item.specId}
            name={item.specId}
            summary={item.summary}
            permission={permissionShortOf(item.permission)}
            type={item.type}
            current={item.specId === selected}
            proposed={proposedIds.includes(item.specId)}
            onSelect={() => url.selectOperation(item.specId)}
          />
        ))}
      </div>
      <Footer list={list} />
    </div>
  );
}

/** Corps de la liste : attente, échec de lecture, vide ou lignes. */
function ListBody(props: OperationBrowserProps & { selected: string | undefined }) {
  const { list } = props;
  if (list.query.isError && !list.aroundMissing) {
    return (
      <ErrorNotice title={OPERATIONS_ERROR_TITLE} onRetry={() => void list.query.refetch()}>
        {rateLimitedReadText(list.query.error) ?? LIST_ERROR_TEXT}
      </ErrorNotice>
    );
  }
  if (!list.query.data) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  return list.items.length === 0 ? <Empty {...props} /> : <Rows {...props} />;
}

function List(props: OperationBrowserProps & { selected: string | undefined }) {
  const { search, list, countBar = true } = props;
  return (
    <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-2.5 px-4 pb-6 md:pr-4 md:pl-7 xl:max-w-[560px]">
      <SearchField
        ref={search.inputRef}
        label={OPERATION_SEARCH_LABEL}
        placeholder={OPERATION_SEARCH_PLACEHOLDER}
        name="q"
        autoComplete="off"
        maxLength={200}
        className="[&_input]:h-[34px] [&_input]:font-mono [&_input]:text-meta max-md:[&_input]:h-11"
        value={search.text}
        aria-busy={list.stale || undefined}
        onChange={(event) => search.onChange(event.target.value)}
      />
      <ZoneFilter {...props} />
      {countBar ? <CountBar {...props} /> : null}
      <ListBody {...props} />
    </div>
  );
}

/**
 * Liste puis fiche des opérations, commune à l'équipe et au client : fiche à droite dès 1280 px, en panneau en dessous,
 * « Liste » sous 768 px.
 */
export function OperationBrowser(props: OperationBrowserProps) {
  const { url, list, detail } = props;
  const phone = useMaxWidth(PHONE_MAX);
  const selected = url.op ?? list.items[0]?.specId;
  const pressed = usePressedChoice(url.op, selected);
  const onPhone = phone && url.op !== undefined;
  const close = () => url.selectOperation(null);
  return (
    <div className="flex min-h-0 flex-1 flex-wrap pt-4 xl:flex-nowrap">
      {onPhone ? null : <List {...props} selected={pressed} />}
      {selected ? (
        <TechnicalFichePanel
          id={selected}
          asked={url.op !== undefined}
          onClose={close}
          back={<BackToList onClick={close} />}
          label="Fiche de l'opération"
          description="Entrées, sorties, erreurs et appelants de l'opération ouverte."
          className={PANEL_CLASS}
        >
          {detail(selected)}
        </TechnicalFichePanel>
      ) : null}
    </div>
  );
}

/** Fiche lue par l'équipe (`ops.byId`) ; un lien périmé quitte l'adresse. */
function TeamDetail({ page, opId }: { page: TechnicalPageModel; opId: string }) {
  const { projectId, url, form } = page;
  const query = useQuery(orpc.spec.technical.ops.byId.queryOptions({ input: { projectId, opId } }));
  const stale = url.op === opId && errorCode(query.error) === "NOT_FOUND";
  const { selectOperation } = url;
  useEffect(() => {
    if (stale) selectOperation(null);
  }, [stale, selectOperation]);
  if (query.isError) {
    return (
      <ErrorNotice title={OPERATION_ERROR_TITLE} onRetry={() => void query.refetch()}>
        {rateLimitedReadText(query.error) ?? LIST_ERROR_TEXT}
      </ErrorNotice>
    );
  }
  if (!query.data) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  return (
    <OperationFiche
      key={opId}
      projectId={projectId}
      operation={query.data}
      onEdit={form.canWrite ? () => form.openEdit(opId) : undefined}
    />
  );
}

/** Onglet API (maquette 14 l.222-258). */
export function TechnicalApiTab({ page }: { page: TechnicalPageModel }) {
  const { url, projectId, form, review, propose } = page;
  const list = useOperations({ projectId, q: url.q, zone: url.zone, op: url.op, enabled: true });
  useUnauthorizedRedirect(list.query.error);
  return (
    <OperationBrowser
      url={url}
      list={list}
      search={page.search}
      countBar={!form.open}
      announcement={page.announcement}
      proposedIds={propose.reviewing ? pendingUpdatesOf(review.proposals, "op") : []}
      onCreate={form.canWrite ? () => url.openCreateOn("api") : undefined}
      detail={(opId) => <TeamDetail page={page} opId={opId} />}
    />
  );
}
