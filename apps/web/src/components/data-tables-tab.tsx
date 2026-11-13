"use client";

import {
  Button,
  CountBar,
  cn,
  EmptyState,
  Icon,
  IdTag,
  ListFooter,
  Pill,
  SearchField,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import { useEffect, useRef } from "react";
import {
  DATA_NOUN,
  DATA_PERSONAL_NOTE,
  DATA_TABLES_LABEL,
  TABLES_TABLE_LABEL,
  usedByText,
} from "../lib/data-labels.ts";
import type { DiagramCard } from "../lib/data-mermaid.ts";
import type { DataPageModel } from "../lib/use-data-page.ts";
import { TABLES_PAGE_SIZE } from "../lib/use-data-tables.ts";
import { FilterChipMenu } from "./features-filters.tsx";

/** Pastille « Oui · NFR-001 » (ambre = `--status-pending-*`) ou « Non » : texte et teinte, jamais la couleur seule. */
function PersonalPill({ personal }: { personal: boolean }) {
  return personal ? (
    <Pill size="md" tone="warning">
      Oui · NFR-001
    </Pill>
  ) : (
    <Pill size="md" tone="outline">
      Non
    </Pill>
  );
}

/** Nom de la table : bouton « Modifier » pour qui écrit (focus rendu ici après l'enregistrement), texte pour le designer. */
function NameCell({
  id,
  name,
  onEdit,
}: {
  id: string;
  name: string;
  onEdit: (() => void) | undefined;
}) {
  return (
    <span className="flex items-center gap-2">
      <IdTag>{id}</IdTag>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Modifier ${id}, ${name}`}
          className="rounded-sm text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11"
        >
          {name}
        </button>
      ) : (
        <span className="font-medium">{name}</span>
      )}
    </span>
  );
}

interface Row {
  id: string;
  name: string;
  zone: string;
  fields: number | string;
  relations: number | string;
  usedBy: readonly string[];
  personal: boolean;
  state?: DiagramCard["state"];
}

/** Une ligne du tableau : identifiant et nom (bouton « Modifier » pour qui écrit), zone, compteurs, « Utilisée par », pastille. */
function DataRow({
  row,
  selected,
  onEdit,
}: {
  row: Row;
  selected: boolean;
  onEdit: ((id: string) => void) | undefined;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "center" });
  }, [selected]);
  const state = row.state;
  return (
    <TableRow
      ref={ref}
      data-spec-id={row.id}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "h-[52px]",
        state === "rejected" && "text-muted-foreground",
        selected && "bg-secondary",
      )}
    >
      <TableHead scope="row" className="font-medium">
        <NameCell
          id={row.id}
          name={row.name}
          onEdit={state || !onEdit ? undefined : () => onEdit(row.id)}
        />
        {state ? (
          <Pill size="xs" tone={state === "review" ? "soft" : "outline"} className="mt-1">
            {state === "review" ? "À relire" : "Rejetée"}
          </Pill>
        ) : null}
      </TableHead>
      <TableCell className="text-meta text-muted-foreground">{row.zone}</TableCell>
      <TableCell className="text-meta text-muted-foreground">{row.fields}</TableCell>
      <TableCell className="text-meta text-muted-foreground">{row.relations}</TableCell>
      <TableCell className="font-mono text-code">{usedByText(row.usedBy)}</TableCell>
      <TableCell>
        <PersonalPill personal={row.personal} />
      </TableCell>
    </TableRow>
  );
}

function Skeletons() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">Chargement des tables…</span>
      {["a", "b", "c", "d"].map((key) => (
        <Skeleton key={key} className="h-[52px] rounded-lg" />
      ))}
    </div>
  );
}

/** Tables proposées par l'agent, ajoutées sous le modèle enregistré pendant la relecture. */
function proposedRows(cards: readonly DiagramCard[], saved: ReadonlySet<string>): Row[] {
  return cards
    .filter((card) => !saved.has(card.id))
    .map((card) => ({
      id: card.id,
      name: card.name,
      zone: "—",
      fields: card.fields.length,
      relations: "—",
      usedBy: [],
      personal: card.fields.some((field) => field.kind === "personal"),
      state: card.state ?? "review",
    }));
}

/** Défilement vers la suite : le pied de liste charge la page suivante quand il entre dans l'écran. */
function useAutoLoad(onLoadMore: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, enabled]);
  return ref;
}

/** Recherche (260 × 32, 44 sous 768 px) puis filtre de zone, à droite de la barre de compte (maquette 11 l.236). */
function Toolbar({ page }: { page: DataPageModel }) {
  const { tables, url, search } = page;
  const zone = url.zone;
  return (
    <>
      <SearchField
        ref={search.inputRef}
        label={DATA_TABLES_LABEL}
        placeholder={DATA_TABLES_LABEL}
        name="q"
        autoComplete="off"
        maxLength={200}
        className="min-w-0 flex-1 basis-[260px] md:flex-none [&_input]:h-8 max-md:[&_input]:h-11"
        value={search.text}
        onChange={(event) => search.onChange(event.target.value)}
      />
      {tables.zones.length > 0 || zone ? (
        <FilterChipMenu
          label="Zone"
          allLabel="Toutes les zones"
          value={zone}
          options={tables.zones.map((entry) => ({
            value: entry.name,
            label: `${entry.name} · ${entry.count}`,
          }))}
          onChange={(value) => url.setZone(value)}
        />
      ) : null}
      {zone ? (
        <Button
          variant="ghost"
          size="sm"
          className="max-md:h-11 max-md:w-full"
          onClick={() => url.setZone(null)}
        >
          Effacer le filtre
        </Button>
      ) : null}
    </>
  );
}

function NoResults({ page }: { page: DataPageModel }) {
  const { url } = page;
  return (
    <EmptyState
      variant="inline"
      bordered
      icon="search_off"
      title={url.q ? `Aucune table ne correspond à « ${url.q} »` : "Aucune table dans cette zone."}
      description={
        url.q
          ? "La recherche porte sur toutes les tables et sur leurs champs, pas seulement ceux affichés."
          : "Choisissez une autre zone ou effacez le filtre pour revoir la liste."
      }
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => (url.q ? url.setQuery(null) : url.setZone(null))}
        >
          {url.q ? "Effacer la recherche" : "Effacer le filtre"}
        </Button>
      }
    />
  );
}

function rowsOf(page: DataPageModel): Row[] {
  const items = page.tables.items;
  return [
    ...items.map((item) => ({
      id: item.specId,
      name: item.name,
      zone: item.zone ?? "—",
      fields: item.fieldCount,
      relations: item.relationCount,
      usedBy: item.usedBy,
      personal: item.personalData,
    })),
    ...(page.propose.reviewing
      ? proposedRows(page.proposed, new Set(items.map((item) => item.specId)))
      : []),
  ];
}

/** Le tableau des tables et son pied de liste (maquette 11 l.239-246). */
function TablesGrid({ page }: { page: DataPageModel }) {
  const { tables, footer, url, form } = page;
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  return (
    <div>
      <Table
        framed
        stickyHeader
        frameLabel={TABLES_TABLE_LABEL}
        aria-label={TABLES_TABLE_LABEL}
        frameClassName={cn("rounded-b-none", tables.items.length > 50 && "max-h-[700px]")}
      >
        <TableHeader>
          <TableRow>
            <TableHead>Table</TableHead>
            <TableHead>Zone</TableHead>
            <TableHead>Champs</TableHead>
            <TableHead>Relations</TableHead>
            <TableHead>Utilisée par</TableHead>
            <TableHead>Données personnelles</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowsOf(page).map((row) => (
            <DataRow
              key={`${row.state ?? "saved"}-${row.id}`}
              row={row}
              selected={row.id === url.sel}
              onEdit={form.canWrite ? form.openEdit : undefined}
            />
          ))}
        </TableBody>
      </Table>
      <div ref={sentinel}>
        <ListFooter
          attached
          className="max-md:[&_button]:h-11 max-md:[&_button]:w-full"
          state={footer.state}
          pageSize={TABLES_PAGE_SIZE}
          loadedCount={tables.items.length}
          total={tables.total}
          noun={DATA_NOUN}
          longList={footer.longList}
          onLoadMore={footer.onLoadMore}
          onRetry={footer.onRetry}
          onBackToTop={() => window.scrollTo({ top: 0 })}
        />
      </div>
    </div>
  );
}

/** Barre de compte : le total du serveur, les tables chargées, la recherche en cours, l'annonce de l'écran. */
function Count({ page, loaded }: { page: DataPageModel; loaded: number }) {
  const { tables, url, region } = page;
  // Pendant la relecture, les tables proposées comptent avec celles du modèle.
  const proposed = page.propose.reviewing
    ? proposedRows(page.proposed, new Set(tables.items.map((i) => i.specId))).length
    : 0;
  return (
    <CountBar
      total={tables.total + proposed}
      loaded={loaded + proposed}
      noun={DATA_NOUN}
      {...(url.q ? { query: url.q } : {})}
      busy={tables.stale}
      showAllLoaded
      trailing={<Toolbar page={page} />}
      {...(region.showCount && region.countText ? { announcement: region.countText } : {})}
    />
  );
}

/**
 * Onglet Tables (maquette 11 l.234-252) : barre de compte, recherche sur les tables et leurs champs, filtre de zone,
 * tableau à en-tête collant (lignes de 52), pied de liste. Pendant la relecture, les tables proposées suivent celles
 * du modèle avec leur pastille. Un clic sur une table ouvre le formulaire de modification pour qui écrit.
 */
export function DataTablesTab({ page }: { page: DataPageModel }) {
  const { tables, view } = page;
  const filtered = view.kind === "empty-filtered";
  return (
    <div className="flex flex-col gap-3">
      <Count page={page} loaded={tables.items.length} />
      {filtered ? (
        <NoResults page={page} />
      ) : view.kind === "loading" ? (
        <Skeletons />
      ) : (
        <TablesGrid page={page} />
      )}
      <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <Icon name="shield" size={16} aria-hidden="true" />
        {DATA_PERSONAL_NOTE}
      </p>
    </div>
  );
}
