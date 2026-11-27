"use client";

import { DATA_PAGE_SIZE, type SecurityDataRow } from "@koklo/contract";
import {
  Button,
  ContextBanner,
  type DataClassificationRow,
  DataClassificationTable,
  FilterChip,
  Icon,
  ListFooter,
  SearchField,
  Skeleton,
} from "@koklo/ui";
import { useState } from "react";
import { rateLimitedReadText } from "../lib/git-read-labels.ts";
import { orpc } from "../lib/orpc.ts";
import {
  CLASSIFY_BUTTON,
  CLEAR_SEARCH,
  DATA_NOUN,
  DATA_RULE,
  DATA_SEARCH_LABEL,
  hostLine,
  LIST_ERROR_TEXT,
  NO_DATA_MATCH,
  NO_DATA_TEXT,
  NO_DATA_TITLE,
  NO_MATCH_TEXT,
  REGISTRY_BUTTON,
  REGISTRY_FAILED,
  SECURITY_ERROR_TITLE,
  TO_DECIDE,
  UNCLASSIFIED_NAME,
  UNDECIDED_CHIP,
} from "../lib/security-labels.ts";
import { needsRetention } from "../lib/security-operations.ts";
import { useAutoLoad } from "../lib/use-auto-load.ts";
import { useListFooter, useSearchBox } from "../lib/use-features-list.ts";
import { type DataListModel, useDataList } from "../lib/use-security-data.ts";
import type { SecurityPageModel } from "../lib/use-security-page.ts";
import { useUnauthorizedRedirect } from "../lib/use-unauthorized-redirect.ts";
import { ErrorNotice } from "./error-notice.tsx";
import { SecurityEmpty } from "./security-empty.tsx";

/** Ligne du tableau (maquette 15 l.526-540) : « À décider » tant qu'une durée manque là où elle est exigée. */
function tableRow(row: SecurityDataRow): DataClassificationRow {
  const unclassified = row.status === "unclassified";
  const toDecide = unclassified || needsRetention(row.category);
  return {
    id: row.field,
    name: row.data ?? UNCLASSIFIED_NAME,
    field: row.fields.join(", "),
    category: row.category,
    retention: row.retention ?? (toDecide ? TO_DECIDE : "—"),
    access: row.access.join(" ; ") || "—",
    protection: row.protection || "—",
    pending: row.status !== "classified",
  };
}

/** Télécharge le registre des traitements rendu par le serveur (`security.registry.export`, B809). */
function useRegistry(projectId: string) {
  const [failed, setFailed] = useState(false);
  const download = async () => {
    setFailed(false);
    try {
      const { filename, markdown } = await orpc.security.registry.export.call({ projectId });
      const href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
      const link = Object.assign(document.createElement("a"), { href, download: filename });
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      setFailed(true);
    }
  };
  return { failed, download };
}

function Banner({ page, list }: { page: SecurityPageModel; list: DataListModel }) {
  const registry = useRegistry(page.projectId);
  if (!list.context) return null;
  return (
    <>
      <ContextBanner
        icon="location_on"
        actions={
          <>
            {page.form.canWrite ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-new-feature
                className="max-md:h-11"
                onClick={() => page.url.openCreateOn("data")}
              >
                <Icon name="add" size={16} />
                {CLASSIFY_BUTTON}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-11"
              onClick={() => void registry.download()}
            >
              <Icon name="download" size={16} />
              {REGISTRY_BUTTON}
            </Button>
          </>
        }
      >
        {hostLine(list.context)}
      </ContextBanner>
      {registry.failed ? <ErrorNotice>{REGISTRY_FAILED}</ErrorNotice> : null}
    </>
  );
}

/** Recherche et « À décider » : au-delà d'une page, ou quand l'une est active (B808). */
function Filters({ page, list }: { page: SecurityPageModel; list: DataListModel }) {
  const { url, totals } = page;
  const search = useSearchBox(url);
  const total = totals.data.data?.total ?? 0;
  if (!url.q && !url.undecided && total <= DATA_PAGE_SIZE) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField
        ref={search.inputRef}
        label={DATA_SEARCH_LABEL}
        placeholder={DATA_SEARCH_LABEL}
        name="q"
        autoComplete="off"
        maxLength={200}
        className="min-w-[220px] max-w-[320px] [&_input]:h-[34px] max-md:[&_input]:h-11"
        value={search.text}
        aria-busy={list.stale || undefined}
        onChange={(event) => search.onChange(event.target.value)}
      />
      <FilterChip
        className="max-md:h-11"
        pressed={url.undecided}
        onPressedChange={url.setUndecided}
      >
        {UNDECIDED_CHIP}
      </FilterChip>
    </div>
  );
}

function Footer({ list }: { list: DataListModel }) {
  const footer = useListFooter(list, () => orpc.security.data.list.key());
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  if (list.total <= DATA_PAGE_SIZE) return null;
  return (
    <div ref={sentinel}>
      <ListFooter
        state={footer.state}
        pageSize={DATA_PAGE_SIZE}
        loadedCount={list.items.length}
        total={list.total}
        noun={DATA_NOUN}
        longList={footer.longList}
        onLoadMore={footer.onLoadMore}
        onRetry={footer.onRetry}
        onBackToTop={() => window.scrollTo({ top: 0 })}
      />
    </div>
  );
}

function Empty({ page }: { page: SecurityPageModel }) {
  const { url, form } = page;
  if (url.q || url.undecided) {
    return (
      <SecurityEmpty
        icon="search_off"
        title={NO_DATA_MATCH}
        text={NO_MATCH_TEXT}
        action={{ label: CLEAR_SEARCH, onClick: url.clearSearch }}
      />
    );
  }
  return (
    <SecurityEmpty
      icon="badge"
      title={NO_DATA_TITLE}
      text={NO_DATA_TEXT}
      action={
        form.canWrite
          ? { label: CLASSIFY_BUTTON, onClick: () => url.openCreateOn("data") }
          : undefined
      }
    />
  );
}

/** « Décider » ouvre la feuille sur la ligne, conservation au focus ; « Modifier » l'ouvre telle quelle. */
const actionOn = (page: SecurityPageModel, rows: readonly SecurityDataRow[]) => (field: string) => {
  const row = rows.find((item) => item.field === field);
  if (!row) return;
  page.write.dismiss();
  if (row.status === "classified") page.url.openEdit(field);
  else page.url.decide(field, row.status === "undecided");
};

function Rows({ page, list }: { page: SecurityPageModel; list: DataListModel }) {
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
      <DataClassificationTable
        rows={list.items.map(tableRow)}
        onAction={page.form.canWrite ? actionOn(page, list.items) : undefined}
      />
      <Footer list={list} />
      <p className="m-0 text-caption font-normal text-muted-foreground">{DATA_RULE}</p>
    </>
  );
}

/** Onglet Données sensibles (maquette 15 l.158-169). */
export function SecurityDataTab({ page }: { page: SecurityPageModel }) {
  const { url, projectId, readable } = page;
  // La ligne de l'adresse n'est cherchée qu'à l'arrivée.
  const [around] = useState(url.data);
  const list = useDataList({
    projectId,
    q: url.q,
    undecided: url.undecided,
    around: url.q || url.undecided ? undefined : around,
    enabled: readable,
  });
  useUnauthorizedRedirect(list.query.error);
  return (
    <div className="flex min-w-0 flex-col gap-3.5 px-4 pt-4 pb-7 md:px-7">
      <Banner page={page} list={list} />
      <Filters page={page} list={list} />
      <Rows page={page} list={list} />
    </div>
  );
}
