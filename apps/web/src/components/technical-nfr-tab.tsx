"use client";

import { NFR_PAGE_SIZE } from "@koklo/contract";
import {
  Button,
  EmptyState,
  formatCount,
  ListFooter,
  NfrCard,
  NfrCategory,
  Skeleton,
} from "@koklo/ui";
import { useEffect, useRef } from "react";
import { rateLimitedReadText } from "../lib/git-read-labels.ts";
import { orpc } from "../lib/orpc.ts";
import { pendingUpdatesOf } from "../lib/proposal-technical.ts";
import {
  COVERAGE_LATER,
  LIST_ERROR_TEXT,
  NFR_CATEGORIES,
  NFR_ERROR_TITLE,
  NFR_NOTE,
  NFR_NOUN,
  NO_NFR_TEXT,
  NO_NFR_TITLE,
  verificationText,
} from "../lib/technical-api-labels.ts";
import { useAutoLoad } from "../lib/use-auto-load.ts";
import { useListFooter } from "../lib/use-features-list.ts";
import { type RequirementListModel, useRequirements } from "../lib/use-technical-api.ts";
import type { TechnicalPageModel } from "../lib/use-technical-page.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { ErrorNotice } from "./error-notice.tsx";

export interface RequirementBrowserProps {
  list: RequirementListModel;
  /** Exigence de l'adresse : amenée à l'écran une fois lue. */
  asked: string | undefined;
  /** Barre de compte absente tant qu'une feuille est ouverte (une seule région d'état). */
  countBar?: boolean;
  announcement?: string;
  staleIds?: readonly string[];
  proposedIds?: readonly string[];
  onEdit?: ((id: string) => void) | undefined;
  /** « Nouvelle exigence » d'une liste vide (équipe qui écrit). */
  onCreate?: (() => void) | undefined;
}

const plural = (count: number): string =>
  `${formatCount(count)} ${count >= 2 ? NFR_NOUN.other : NFR_NOUN.one}`;

/** Barre de compte : région d'état de l'onglet, présente dès l'attente pour que ses annonces soient lues. */
function CountBar({ list, announcement }: RequirementBrowserProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-meta text-muted-foreground"
    >
      {list.query.data ? (
        <>
          <span className="font-semibold text-foreground">{plural(list.total)}</span>
          <span>{COVERAGE_LATER}</span>
          <span className="flex-1" />
          <span>{NFR_NOTE}</span>
        </>
      ) : null}
      {announcement ? <span className="sr-only">{announcement}</span> : null}
    </div>
  );
}

/** Sections par catégorie et leurs cartes (maquette 14 l.262-276) ; aucune couverture avant la Qualité (B774). */
function Categories(props: RequirementBrowserProps) {
  const { list, staleIds = [], proposedIds = [], onEdit } = props;
  return (
    <>
      {NFR_CATEGORIES.map(({ value, label, icon }) => {
        const cards = list.items.filter((item) => item.category === value);
        if (cards.length === 0) return null;
        return (
          <NfrCategory
            key={value}
            label={label}
            icon={icon}
            count={list.categories[value] ?? cards.length}
          >
            {cards.map((item) => (
              <div key={item.specId} data-spec-id={item.specId} className="grid min-w-0">
                <NfrCard
                  id={item.specId}
                  title={item.title}
                  target={item.target}
                  statement={item.statement}
                  verification={verificationText(item.verification, item.verificationDetail)}
                  stale={staleIds.includes(item.specId)}
                  proposed={proposedIds.includes(item.specId)}
                  onEdit={onEdit ? () => onEdit(item.specId) : undefined}
                />
              </div>
            ))}
          </NfrCategory>
        );
      })}
    </>
  );
}

function Footer({ list }: { list: RequirementListModel }) {
  const footer = useListFooter(list, () => orpc.spec.technical.nfr.key());
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  if (list.total <= NFR_PAGE_SIZE) return null;
  return (
    <div ref={sentinel}>
      <ListFooter
        state={footer.state}
        pageSize={NFR_PAGE_SIZE}
        loadedCount={list.items.length}
        total={list.total}
        noun={NFR_NOUN}
        longList={footer.longList}
        onLoadMore={footer.onLoadMore}
        onRetry={footer.onRetry}
        onBackToTop={() => window.scrollTo({ top: 0 })}
      />
    </div>
  );
}

function Empty({ onCreate }: RequirementBrowserProps) {
  return (
    <EmptyState
      variant="inline"
      bordered
      icon="speed"
      title={NO_NFR_TITLE}
      description={NO_NFR_TEXT}
      {...(onCreate
        ? {
            action: (
              <Button variant="outline" size="sm" className="max-md:h-11" onClick={onCreate}>
                Nouvelle exigence
              </Button>
            ),
          }
        : {})}
    />
  );
}

function Body(props: RequirementBrowserProps) {
  const { list } = props;
  if (list.query.isError && !list.aroundMissing) {
    return (
      <ErrorNotice title={NFR_ERROR_TITLE} onRetry={() => void list.query.refetch()}>
        {rateLimitedReadText(list.query.error) ?? LIST_ERROR_TEXT}
      </ErrorNotice>
    );
  }
  if (!list.query.data) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  if (list.items.length === 0) return <Empty {...props} />;
  return (
    <>
      {list.hasPrevious ? (
        <Button
          type="button"
          variant="outline"
          className="self-center max-md:h-11"
          onClick={() => void list.query.fetchPreviousPage()}
        >
          Charger les précédentes
        </Button>
      ) : null}
      <Categories {...props} />
      <Footer list={list} />
    </>
  );
}

/** L'exigence d'un lien direct est amenée à l'écran, une seule fois. */
function useReveal(asked: string | undefined, ready: boolean) {
  const done = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!asked || !ready || done.current === asked) return;
    done.current = asked;
    const card = document.querySelector(`[data-spec-id="${asked}"]`);
    card?.scrollIntoView?.({ block: "nearest" });
  }, [asked, ready]);
}

/** Exigences par catégorie, communes à l'équipe et au client. */
export function RequirementBrowser(props: RequirementBrowserProps) {
  const { list, asked, countBar = true } = props;
  useReveal(asked, list.items.length > 0);
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-4 pb-6 md:px-7">
      {countBar ? <CountBar {...props} /> : null}
      <Body {...props} />
    </div>
  );
}

/** Onglet Exigences (maquette 14 l.259-279). */
export function TechnicalNfrTab({ page }: { page: TechnicalPageModel }) {
  const { url, projectId, form, review, propose, upstream } = page;
  const list = useRequirements({ projectId, nfr: url.nfr, enabled: true });
  useUnauthorizedRedirect(list.query.error);
  return (
    <RequirementBrowser
      list={list}
      asked={url.nfr}
      countBar={!form.open}
      announcement={page.announcement}
      staleIds={upstream.items}
      proposedIds={propose.reviewing ? pendingUpdatesOf(review.proposals, "nfr") : []}
      onEdit={form.canWrite ? form.openEdit : undefined}
      onCreate={form.canWrite ? () => url.openCreateOn("nfr") : undefined}
    />
  );
}
