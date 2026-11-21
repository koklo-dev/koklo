"use client";

import { Button, CountBar, cn, EmptyState, ListFooter, SearchField, Skeleton } from "@koklo/ui";
import {
  DECISION_NOUN,
  DECISION_PERIOD_LABELS,
  DECISIONS_SEARCH_LABEL,
  DECISIONS_SEARCH_PLACEHOLDER,
  decisionsScope,
} from "../lib/architecture-labels.ts";
import {
  ADR_PERIODS,
  ADR_STATUS_PARAMS,
  type AdrPeriod,
  type AdrStatusParam,
} from "../lib/architecture-tab.ts";
import { orpc } from "../lib/orpc.ts";
import { DECISIONS_PAGE_SIZE, useArchitectureDecision } from "../lib/use-architecture-decisions.ts";
import type { ArchitecturePageModel } from "../lib/use-architecture-page.ts";
import { useAutoLoad } from "../lib/use-auto-load.ts";
import { useListFooter } from "../lib/use-features-list.ts";
import { ArchitectureDecisionFiche } from "./architecture-decision-fiche.tsx";
import { ArchitectureDecisionList, BackToList } from "./architecture-decision-list.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { FilterChipMenu } from "./features-filters.tsx";

export const STATUS_LABELS: Record<AdrStatusParam, string> = {
  acceptee: "Acceptée",
  proposee: "Proposée",
  remplacee: "Remplacée",
};

/** Recherche et puces de filtre (maquette 13 l.381 : recherche, trois puces pointillées Statut, Composant, Date). */
function Toolbar({ page }: { page: ArchitecturePageModel }) {
  const { url, search, decisions } = page;
  const filtered = Boolean(url.status || url.component || url.period || url.q);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField
        ref={search.inputRef}
        label={DECISIONS_SEARCH_LABEL}
        placeholder={DECISIONS_SEARCH_PLACEHOLDER}
        name="q"
        autoComplete="off"
        maxLength={200}
        className="min-w-0 flex-1 basis-[200px] [&_input]:h-8 max-md:[&_input]:h-11"
        value={search.text}
        onChange={(event) => search.onChange(event.target.value)}
      />
      <FilterChipMenu
        label="Statut"
        allLabel="Tous les statuts"
        value={url.status}
        options={ADR_STATUS_PARAMS.map((value) => ({
          value,
          label: `${STATUS_LABELS[value]} · ${decisions.facets[value] ?? 0}`,
        }))}
        onChange={(value) => url.setStatus(value as AdrStatusParam | null)}
      />
      {url.component ? (
        <FilterChipMenu
          label="Composant"
          allLabel="Tous les composants"
          value={url.component}
          options={[{ value: url.component, label: url.component }]}
          onChange={(value) => url.setComponent(value)}
        />
      ) : null}
      <FilterChipMenu
        label="Date"
        allLabel="Toutes les dates"
        value={url.period}
        options={ADR_PERIODS.map((value) => ({ value, label: DECISION_PERIOD_LABELS[value] }))}
        onChange={(value) => url.setPeriod(value as AdrPeriod | null)}
      />
      {filtered ? (
        <Button
          variant="ghost"
          size="sm"
          className="max-md:h-11"
          onClick={url.clearDecisionFilters}
        >
          Effacer les filtres
        </Button>
      ) : null}
    </div>
  );
}

/** Fiche de la décision choisie : lue à la demande, « Modifier » pour qui écrit. */
function Detail({ page, id }: { page: ArchitecturePageModel; id: string }) {
  const query = useArchitectureDecision(page.projectId, id);
  const { data } = query;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-[999_1_480px] flex-col gap-3",
        !page.url.d && "max-md:hidden",
      )}
    >
      <BackToList onClick={() => page.url.selectDecision(null)} />
      {query.isPending ? <Skeleton aria-busy="true" className="h-64 rounded-xl" /> : null}
      {query.isError ? (
        <ErrorNotice title="Impossible de charger la décision" onRetry={() => void query.refetch()}>
          La décision n'a pas pu être lue.
        </ErrorNotice>
      ) : null}
      {data ? (
        <ArchitectureDecisionFiche
          data={{ ...data, id: data.specId, plain: undefined }}
          onEdit={page.form.canWrite ? () => page.form.openEdit(id) : undefined}
        />
      ) : null}
    </div>
  );
}

function Empty({ page }: { page: ArchitecturePageModel }) {
  const { url } = page;
  const filtered = Boolean(url.status || url.component || url.period || url.q);
  return (
    <EmptyState
      variant="inline"
      bordered
      icon={filtered ? "search_off" : "gavel"}
      title={
        filtered
          ? url.q
            ? `Aucune décision ne correspond à « ${url.q} »`
            : "Aucune décision pour ce filtre."
          : "Aucune décision"
      }
      description={
        filtered
          ? "La recherche et les filtres portent sur toutes les décisions du projet."
          : "Une décision d'architecture garde la trace d'un choix et de ses raisons."
      }
      {...(filtered
        ? {
            action: (
              <Button variant="outline" size="sm" onClick={url.clearDecisionFilters}>
                Effacer les filtres
              </Button>
            ),
          }
        : page.form.canWrite
          ? {
              action: (
                <Button variant="outline" size="sm" onClick={page.url.openCreateDecision}>
                  Nouvelle décision
                </Button>
              ),
            }
          : {})}
    />
  );
}

/** Pied de liste : « Charger la suite » et chargement automatique en approchant du bas. */
function DecisionsFooter({ decisions }: { decisions: ArchitecturePageModel["decisions"] }) {
  const footer = useListFooter(decisions, () => orpc.spec.architecture.adr.key());
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  return (
    <div ref={sentinel}>
      <ListFooter
        attached
        state={footer.state}
        pageSize={DECISIONS_PAGE_SIZE}
        loadedCount={decisions.items.length}
        total={decisions.total}
        noun={DECISION_NOUN}
        longList={footer.longList}
        onLoadMore={footer.onLoadMore}
        onRetry={footer.onRetry}
        onBackToTop={() => window.scrollTo({ top: 0 })}
      />
    </div>
  );
}

/**
 * Onglet Décisions (maquette 13 l.376-401) : recherche et trois puces de filtre dans l'adresse, barre de compte par
 * statut, liste de 50 par page (suite au défilement), fiche de la décision choisie. Sous 768 px, la liste puis la fiche
 * avec « Liste » pour revenir.
 */
export function ArchitectureDecisionsTab({ page }: { page: ArchitecturePageModel }) {
  const { decisions, url, region } = page;
  if (decisions.query.isError && decisions.items.length === 0 && !decisions.aroundMissing) {
    return (
      <ErrorNotice
        title="Impossible de charger les décisions"
        onRetry={() => void decisions.query.refetch()}
      >
        Les décisions n'ont pas pu être lues. Réessayez dans un instant.
      </ErrorNotice>
    );
  }
  if (decisions.query.isPending) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  const current = url.d ?? decisions.items[0]?.specId;
  const unfiltered = !(url.status || url.component || url.period || url.q);
  const controls = (
    <>
      <Toolbar page={page} />
      <CountBar
        total={decisions.total}
        loaded={decisions.items.length}
        noun={DECISION_NOUN}
        {...(url.q ? { query: url.q } : {})}
        busy={decisions.stale}
        {...(unfiltered && decisionsScope(decisions.facets)
          ? { scope: decisionsScope(decisions.facets) }
          : {})}
        {...(region.srText ? { announcement: region.srText } : {})}
      />
    </>
  );
  if (decisions.items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {controls}
        <Empty page={page} />
      </div>
    );
  }
  // Maquette 13 l.378-381 : recherche, puces et compte dans la colonne de la liste ; la fiche démarre en haut.
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div
        className={cn(
          "flex min-w-[280px] flex-[1_1_420px] flex-col gap-3 md:max-w-[520px]",
          url.d && "max-md:hidden",
        )}
      >
        {controls}
        <ArchitectureDecisionList
          rows={decisions.items.map((row) => ({
            id: row.specId,
            title: row.title,
            status: row.status,
            date: row.date,
            links: row.links,
          }))}
          selected={current}
          onSelect={url.selectDecision}
          footer={<DecisionsFooter decisions={decisions} />}
        />
      </div>
      {current ? <Detail key={current} page={page} id={current} /> : null}
    </div>
  );
}
