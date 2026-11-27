"use client";

import { THREAT_PAGE_SIZE, type ThreatSummary } from "@koklo/contract";
import {
  Button,
  FilterChip,
  GroupSection,
  ListFooter,
  Pill,
  SearchField,
  Skeleton,
  ThreatRow,
  type ThreatState,
} from "@koklo/ui";
import { useEffect, useState } from "react";
import { rateLimitedReadText } from "../lib/git-read-labels.ts";
import { orpc } from "../lib/orpc.ts";
import {
  CLEAR_SEARCH,
  FICHE_LABEL,
  LIST_ERROR_TEXT,
  measureInstruction,
  NO_MATCH_TEXT,
  NO_THREAT_MATCH,
  NO_THREAT_TEXT,
  NO_THREAT_TITLE,
  SECURITY_ERROR_TITLE,
  THREAT_CHIPS,
  THREAT_NOUN,
  THREAT_SEARCH_LABEL,
  threatCountText,
  threatLineText,
} from "../lib/security-labels.ts";
import { useAutoLoad } from "../lib/use-auto-load.ts";
import { useListFooter, useSearchBox } from "../lib/use-features-list.ts";
import { PHONE_MAX, useMaxWidth } from "../lib/use-max-width.ts";
import { countsOf, type ThreatListModel, useThreatList } from "../lib/use-security-data.ts";
import type { SecurityPageModel } from "../lib/use-security-page.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { BackToList } from "./architecture-decision-list.tsx";
import { ErrorNotice } from "./error-notice.tsx";
import { SettledLaunchReport } from "./launch-report-note.tsx";
import { SecurityEmpty } from "./security-empty.tsx";
import { ThreatFiche } from "./security-threat-fiche.tsx";
import { TechnicalFichePanel } from "./technical-fiche-panel.tsx";

/** Menaces que la relecture ouverte propose de compléter : leur ligne se dit « Proposée ». */
const proposedIds = (page: SecurityPageModel): string[] =>
  page.propose.reviewing
    ? page.review.proposals
        .filter((proposal) => proposal.kind === "threat" && proposal.status === "pending")
        .map((proposal) => String(proposal.content.specId ?? ""))
    : [];

function stateOf(
  threat: ThreatSummary,
  stale: readonly string[],
  proposed: readonly string[],
): ThreatState {
  if (stale.includes(threat.id)) return "stale";
  return proposed.includes(threat.id) ? "proposed" : threat.status;
}

/** « 18 menaces · 17 traitées · 8 de gravité élevée » et pastille « N à traiter » : région d'état de l'onglet. */
function CountBar({ page }: { page: SecurityPageModel }) {
  const counts = countsOf(page.totals);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-meta text-muted-foreground"
    >
      {counts ? (
        <>
          <span className="font-semibold text-foreground">{threatCountText(counts.threats)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {threatLineText(counts.treated, page.totals.threats.data?.facets?.status?.high ?? 0)}
          </span>
          {counts.todo > 0 ? (
            <Pill size="sm" tone="warning" icon="warning">
              {`${counts.todo} à traiter`}
            </Pill>
          ) : null}
        </>
      ) : null}
      {page.announcement ? <span className="sr-only">{page.announcement}</span> : null}
    </div>
  );
}

function Filters({ page, list }: { page: SecurityPageModel; list: ThreatListModel }) {
  const { url } = page;
  const search = useSearchBox(url);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField
        ref={search.inputRef}
        label={THREAT_SEARCH_LABEL}
        placeholder={THREAT_SEARCH_LABEL}
        name="q"
        autoComplete="off"
        maxLength={200}
        className="min-w-[220px] max-w-[320px] [&_input]:h-[34px] max-md:[&_input]:h-11"
        value={search.text}
        aria-busy={list.stale || undefined}
        onChange={(event) => search.onChange(event.target.value)}
      />
      {THREAT_CHIPS.map(([value, label]) => (
        <FilterChip
          key={label}
          className="max-md:h-11"
          pressed={url.filter === value}
          onPressedChange={() => url.setFilter(value ?? null)}
        >
          {label}
        </FilterChip>
      ))}
    </div>
  );
}

function Footer({ list }: { list: ThreatListModel }) {
  const footer = useListFooter(list, () => orpc.security.threat.list.key());
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  if (list.total <= THREAT_PAGE_SIZE) return null;
  return (
    <div ref={sentinel}>
      <ListFooter
        state={footer.state}
        pageSize={THREAT_PAGE_SIZE}
        loadedCount={list.items.length}
        total={list.total}
        noun={THREAT_NOUN}
        longList={footer.longList}
        onLoadMore={footer.onLoadMore}
        onRetry={footer.onRetry}
        onBackToTop={() => window.scrollTo({ top: 0 })}
      />
    </div>
  );
}

/** Groupes repliables par surface, dans l'ordre du serveur (surface puis identifiant). */
function Groups({
  page,
  list,
  selected,
}: {
  page: SecurityPageModel;
  list: ThreatListModel;
  selected: string | undefined;
}) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const proposed = proposedIds(page);
  const surfaces = [...new Set(list.items.map((item) => item.surface))];
  const toggle = (surface: string, open: boolean) =>
    setClosed((current) => {
      const next = new Set(current);
      if (open) next.delete(surface);
      else next.add(surface);
      return next;
    });
  return (
    <>
      {surfaces.map((surface) => {
        const rows = list.items.filter((item) => item.surface === surface);
        const count = list.surfaceCounts[surface] ?? rows.length;
        return (
          <GroupSection
            key={surface}
            tag={surface === "api" ? "API" : surface}
            label={list.surfaces.find((entry) => entry.id === surface)?.title ?? surface}
            counts={threatCountText(count)}
            countsAtEnd
            headingLevel={2}
            open={!closed.has(surface)}
            onOpenChange={(open) => toggle(surface, open)}
            className="overflow-hidden"
          >
            {rows.map((row) => (
              <div key={row.id} data-spec-id={row.id} className="border-t first:border-t-0">
                <ThreatRow
                  threatId={row.id}
                  title={row.title}
                  gravity={row.severity}
                  state={stateOf(row, page.upstream.items, proposed)}
                  current={row.id === selected}
                  onClick={() => page.url.selectThreat(row.id)}
                />
              </div>
            ))}
          </GroupSection>
        );
      })}
    </>
  );
}

function Empty({ page }: { page: SecurityPageModel }) {
  const { url, form } = page;
  if (url.q || url.filter) {
    return (
      <SecurityEmpty
        icon="search_off"
        title={NO_THREAT_MATCH}
        text={NO_MATCH_TEXT}
        action={{ label: CLEAR_SEARCH, onClick: url.clearSearch }}
      />
    );
  }
  return (
    <>
      <SettledLaunchReport propose={page.propose} />
      <SecurityEmpty
        icon="gpp_maybe"
        title={NO_THREAT_TITLE}
        text={NO_THREAT_TEXT}
        action={
          form.canWrite
            ? { label: "Nouvelle menace", onClick: () => url.openCreateOn("threats") }
            : undefined
        }
      />
    </>
  );
}

function Items(props: {
  page: SecurityPageModel;
  list: ThreatListModel;
  selected: string | undefined;
}) {
  const { list, page } = props;
  if (list.query.isError && !list.aroundMissing) {
    return (
      <ErrorNotice title={SECURITY_ERROR_TITLE} onRetry={() => void list.query.refetch()}>
        {rateLimitedReadText(list.query.error) ?? LIST_ERROR_TEXT}
      </ErrorNotice>
    );
  }
  if (!list.query.data) return <Skeleton aria-busy="true" className="h-64 rounded-xl" />;
  if (list.items.length === 0) return <Empty page={page} />;
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
      <Groups {...props} />
      <Footer list={list} />
    </>
  );
}

/** Menace dont la fiche s'ouvre : celle de l'adresse, sinon la première élevée sans parade, sinon la première. */
const selectedOf = (items: readonly ThreatSummary[], asked: string | undefined) =>
  asked ??
  (items.find((item) => item.status === "todo" && item.severity === "high") ?? items[0])?.id;

/** Liste de la recherche et du filtre ; un lien périmé repart de la première page. */
function useThreats(page: SecurityPageModel) {
  const { url, projectId, readable } = page;
  const [dropped, setDropped] = useState<string>();
  // La menace de l'adresse n'est cherchée qu'à l'arrivée : choisir une ligne ne recharge pas la liste.
  const [first] = useState(url.threat);
  const around = first === dropped ? undefined : first;
  const list = useThreatList({
    projectId,
    q: url.q,
    filter: url.filter,
    around: url.q || url.filter ? undefined : around,
    enabled: readable,
  });
  const { aroundMissing } = list;
  useEffect(() => {
    if (aroundMissing) setDropped(first);
  }, [aroundMissing, first]);
  useUnauthorizedRedirect(list.query.error);
  return list;
}

/** Tables du modèle citées par les données : elles distinguent un champ d'une opération dans « Touche ». */
const tablesOf = (page: SecurityPageModel): ReadonlySet<string> =>
  new Set(
    (page.totals.data.data?.items ?? []).flatMap((row) =>
      row.fields.map((field) => field.split(".")[0] ?? ""),
    ),
  );

/**
 * Onglet Menaces (maquette 15 l.120-156) : recherche, puces, compte et groupes par surface ; fiche à droite dès 1280 px,
 * en panneau en dessous ; sous 768 px, la liste puis la fiche avec « Liste » pour revenir.
 */
export function SecurityThreatsTab({ page }: { page: SecurityPageModel }) {
  const { url, form, propose } = page;
  const list = useThreats(page);
  const phone = useMaxWidth(PHONE_MAX);
  const selected = selectedOf(list.items, url.threat);
  const onPhone = phone && url.threat !== undefined;
  const ask =
    propose.enabled && form.canWrite
      ? (id: string) => propose.launch.prefill("threats", measureInstruction(id))
      : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-wrap xl:flex-nowrap">
      {onPhone ? null : (
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3 px-4 pt-4 pb-6 md:pl-7">
          <Filters page={page} list={list} />
          {form.open ? null : <CountBar page={page} />}
          <Items page={page} list={list} selected={selected} />
        </div>
      )}
      {selected ? (
        <TechnicalFichePanel
          id={selected}
          asked={url.threat !== undefined}
          onClose={() => url.selectThreat(null)}
          label={FICHE_LABEL}
          description={`Fiche de la menace ${selected}`}
          back={<BackToList onClick={() => url.selectThreat(null)} />}
          className="flex w-full max-w-[560px] flex-[1_1_440px] flex-col gap-3 border-border border-l px-[22px] pt-4 pb-6"
        >
          <ThreatFiche
            key={selected}
            projectId={page.projectId}
            threatId={selected}
            tables={tablesOf(page)}
            onEdit={form.canWrite ? () => form.openEdit(selected) : undefined}
            onPropose={ask}
          />
        </TechnicalFichePanel>
      ) : null}
    </div>
  );
}
