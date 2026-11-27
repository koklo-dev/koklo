"use client";

import {
  Button,
  CountBar,
  cn,
  EmptyState,
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
  COMPONENT_NOUN,
  COMPONENTS_SEARCH_LABEL,
  COMPONENTS_SEARCH_PLACEHOLDER,
  COMPONENTS_TABLE_LABEL,
  componentTypeLabel,
  decisionsText,
} from "../lib/architecture-labels.ts";
import { architectureRefOf } from "../lib/proposal-architecture.ts";
import { COMPONENTS_PAGE_SIZE } from "../lib/use-architecture-components.ts";
import type { ArchitecturePageModel } from "../lib/use-architecture-page.ts";
import { isProposedComponent } from "../lib/use-architecture-proposed.ts";
import { useAutoLoad } from "../lib/use-auto-load.ts";
import { NARROW_MAX, useMaxWidth } from "../lib/use-max-width.ts";
import { FilterChipMenu } from "./features-filters.tsx";

type RowState = "review" | "accepted" | "rejected";

const STATE_LABELS: Record<RowState, string> = {
  review: "À relire",
  accepted: "Acceptée",
  rejected: "Rejetée",
};

interface Row {
  id: string;
  name: string;
  type: string;
  zone: string;
  responsibility: string;
  dependsOn: number | string;
  decisions: readonly string[];
  state?: RowState;
}

/** Type en `Pill` : `soft` ; Externe en pointillé et écrit (maquette 13 l.797, DESIGN.md §5.22). */
export function TypePill({ type, className }: { type: string; className?: string }) {
  return (
    <Pill size="md" tone={type === "ext" ? "dashed" : "soft"} className={className}>
      {componentTypeLabel(type)}
    </Pill>
  );
}

/** Nom du composant : bouton « Modifier » pour qui écrit (focus rendu ici après l'enregistrement), texte pour le designer. */
function NameCell({
  id,
  name,
  onEdit,
  verb,
}: {
  id: string;
  name: string;
  onEdit: (() => void) | undefined;
  verb: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <IdTag>{id}</IdTag>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`${verb} ${id}, ${name}`}
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

/** Une ligne de 52 : identifiant et nom, type, zone, responsabilité (une ligne, coupée), dépendances, décisions. */
function ComponentRow({
  row,
  selected,
  onEdit,
  verb,
}: {
  row: Row;
  selected: boolean;
  onEdit: ((id: string) => void) | undefined;
  verb: string;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "center" });
  }, [selected]);
  const { state } = row;
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
      <TableHead scope="row" className="whitespace-nowrap text-body font-medium text-foreground">
        <NameCell
          id={row.id}
          name={row.name}
          onEdit={state || !onEdit ? undefined : () => onEdit(row.id)}
          verb={verb}
        />
        {state ? (
          <Pill size="xs" tone={state === "rejected" ? "outline" : "soft"} className="mt-1">
            {STATE_LABELS[state]}
          </Pill>
        ) : null}
      </TableHead>
      <TableCell>
        <TypePill type={row.type} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-meta text-muted-foreground">
        {row.zone}
      </TableCell>
      <TableCell className="max-w-[360px] text-meta">
        <span className="block truncate" title={row.responsibility}>
          {row.responsibility}
        </span>
      </TableCell>
      <TableCell className="font-mono text-code text-muted-foreground">{row.dependsOn}</TableCell>
      <TableCell className="whitespace-nowrap font-mono text-code">
        {decisionsText(row.decisions)}
      </TableCell>
    </TableRow>
  );
}

function Skeletons() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">Chargement des composants…</span>
      {["a", "b", "c", "d"].map((key) => (
        <Skeleton key={key} className="h-[52px] rounded-lg" />
      ))}
    </div>
  );
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Composants proposés par l'agent, ajoutés sous ceux de la spec pendant la relecture (identifiant `C-<slug du nom>`). */
function proposedRows(
  { proposals, failed }: ArchitecturePageModel["review"],
  saved: ReadonlySet<string>,
): Row[] {
  return proposals
    .filter((proposal) => isProposedComponent(proposal, failed))
    .filter((proposal) => !saved.has(architectureRefOf(proposal)))
    .map((proposal) => {
      const { content } = proposal;
      const depends = Array.isArray(content.dependsOn) ? content.dependsOn.length : 0;
      return {
        id: architectureRefOf(proposal),
        name: text(content.name),
        type: text(content.type),
        zone: proposal.zone || text(content.zone),
        responsibility: text(content.responsibility),
        dependsOn: depends,
        decisions: Array.isArray(content.decisions) ? (content.decisions as string[]) : [],
        state: (proposal.status === "pending" ? "review" : proposal.status) as RowState,
      };
    });
}

/** Recherche (260 × 32, 44 sous 768 px) puis filtre de zone, à droite de la barre de compte (maquette 13 l.364). */
function Toolbar({ page }: { page: ArchitecturePageModel }) {
  const { components, url, search } = page;
  const zone = url.zone;
  return (
    <>
      <SearchField
        ref={search.inputRef}
        label={COMPONENTS_SEARCH_LABEL}
        placeholder={COMPONENTS_SEARCH_PLACEHOLDER}
        name="q"
        autoComplete="off"
        maxLength={200}
        className="min-w-0 flex-1 basis-[260px] md:flex-none [&_input]:h-8 max-md:[&_input]:h-11"
        value={search.text}
        onChange={(event) => search.onChange(event.target.value)}
      />
      {components.zones.length > 0 || zone ? (
        <FilterChipMenu
          label="Zone"
          allLabel="Toutes les zones"
          value={zone}
          options={components.zones.map((entry) => ({
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

function NoResults({ page }: { page: ArchitecturePageModel }) {
  const { url } = page;
  return (
    <EmptyState
      variant="inline"
      bordered
      icon="search_off"
      title={
        url.q ? `Aucun composant ne correspond à « ${url.q} »` : "Aucun composant dans cette zone."
      }
      description={
        url.q
          ? "La recherche porte sur tous les composants du projet, pas seulement ceux affichés."
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

function rowsOf(page: ArchitecturePageModel): Row[] {
  const items = page.components.items;
  return [
    ...items.map((item) => ({
      id: item.specId,
      name: item.name,
      type: item.type,
      zone: item.zone,
      responsibility: item.responsibility,
      dependsOn: item.dependsOnCount,
      decisions: item.decisions,
    })),
    ...(page.propose.reviewing
      ? proposedRows(page.review, new Set(items.map((item) => item.specId)))
      : []),
  ];
}

/** Le tableau des composants et son pied de liste (maquette 13 l.363-374). */
function ComponentsGrid({ page, rows }: { page: ArchitecturePageModel; rows: readonly Row[] }) {
  const { components, footer, url, form } = page;
  const sentinel = useAutoLoad(footer.onLoadMore, footer.state === "more");
  // B585 : dès 1024 px, une ligne ouvre le Schéma sur la zone du composant ; en dessous, la fiche en feuille (écriture).
  const wide = !useMaxWidth(NARROW_MAX);
  const zoneOf = new Map(rows.map((row) => [row.id, row.zone]));
  const open = wide
    ? (id: string) => url.openSchemaZone(zoneOf.get(id) ?? "", id)
    : form.canWrite
      ? form.openEdit
      : undefined;
  return (
    <div>
      <Table
        framed
        stickyHeader
        frameLabel={COMPONENTS_TABLE_LABEL}
        aria-label={COMPONENTS_TABLE_LABEL}
        frameClassName={cn("rounded-b-none", components.items.length > 50 && "max-h-[760px]")}
      >
        <TableHeader>
          <TableRow>
            <TableHead>Composant</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Zone</TableHead>
            <TableHead>Responsabilité</TableHead>
            <TableHead className="whitespace-nowrap">Dépend de</TableHead>
            <TableHead>Décisions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ComponentRow
              key={`${row.state ?? "saved"}-${row.id}`}
              row={row}
              selected={row.id === url.c}
              onEdit={open}
              verb={wide ? "Ouvrir dans le schéma" : "Modifier"}
            />
          ))}
        </TableBody>
      </Table>
      <div ref={sentinel}>
        <ListFooter
          attached
          className="max-md:[&_button]:h-11 max-md:[&_button]:w-full"
          state={footer.state}
          pageSize={COMPONENTS_PAGE_SIZE}
          loadedCount={components.items.length}
          total={components.total}
          noun={COMPONENT_NOUN}
          longList={footer.longList}
          onLoadMore={footer.onLoadMore}
          onRetry={footer.onRetry}
          onBackToTop={() => window.scrollTo({ top: 0 })}
        />
      </div>
    </div>
  );
}

/** Barre de compte : le total du serveur, les composants chargés, la recherche en cours, l'annonce de l'écran. */
function Count({ page, rows }: { page: ArchitecturePageModel; rows: readonly Row[] }) {
  const { components, url, region, proposedComponents } = page;
  // Pendant la relecture, le total ajoute les composants proposés de tout le lancement ; les lignes chargées en sont une partie.
  const proposed = rows.filter((row) => row.state && row.state !== "rejected").length;
  return (
    <CountBar
      total={components.total + proposedComponents}
      loaded={components.items.length + Math.min(proposed, proposedComponents)}
      noun={COMPONENT_NOUN}
      {...(url.q ? { query: url.q } : {})}
      busy={components.stale}
      showAllLoaded
      trailing={<Toolbar page={page} />}
      {...(region.showCount && region.countText ? { announcement: region.countText } : {})}
    />
  );
}

/**
 * Onglet Composants (maquette 13 l.363-374) : barre de compte, recherche sur tous les composants, filtre de zone,
 * tableau à en-tête collant (lignes de 52), pied de liste « Fin de la liste · N composants ». Pendant la relecture, les
 * composants proposés suivent ceux de la spec avec leur pastille. Un clic sur un composant ouvre sa fiche en feuille
 * pour qui écrit (le Schéma l'ouvrira avec TK-112).
 */
export function ArchitectureComponentsTab({ page }: { page: ArchitecturePageModel }) {
  const { view } = page;
  const rows = rowsOf(page);
  return (
    <div className="flex flex-col gap-3">
      <Count page={page} rows={rows} />
      {view.kind === "empty-filtered" ? (
        <NoResults page={page} />
      ) : view.kind === "loading" ? (
        <Skeletons />
      ) : (
        <ComponentsGrid page={page} rows={rows} />
      )}
    </div>
  );
}
