"use client";

import type { ClientDataTable, ClientSpaceDataModel } from "@koklo/contract";
import {
  DiagramViewer,
  EmptyState,
  Icon,
  IdTag,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@koklo/ui";
import { useMemo } from "react";
import { TRUNCATED_NOTE } from "../lib/data-client-labels.ts";
import { clientCardsOf, clientRelationsOf } from "../lib/data-client-model.ts";
import {
  DATA_FIXTURES_HELP,
  DATA_PERSONAL_NOTE,
  TABLES_TABLE_LABEL,
  usedByText,
} from "../lib/data-labels.ts";
import { useClientFixtureRows, useClientFixtures } from "../lib/use-client-data.ts";
import { nodeOf, type TableNode } from "../lib/use-data-diagram.ts";
import type { DataUrl } from "../lib/use-data-url.ts";
import { DataClientFiche } from "./data-client-fiche.tsx";
import {
  FicheFrame,
  HINT_COMPACT,
  Legend,
  renderTable,
  useDiagramZoom,
  VIEWER_HEIGHT,
} from "./data-diagram-parts.tsx";
import { FixtureBlock } from "./data-fixtures-tab.tsx";
import { PersonalPill } from "./data-tables-tab.tsx";
import { ErrorNotice } from "./error-notice.tsx";

const HINT = "Cliquez une table pour voir sa fiche.";

interface DiagramProps {
  model: ClientSpaceDataModel;
  url: DataUrl;
  /** Absent pour qui ne peut pas commenter (business). */
  onComment: ((tableId: string) => void) | undefined;
}

/** Onglet Diagramme (maquette 11 l.168-228) : lecteur en lecture seule, positions de l'équipe, fiche de la table choisie. */
export function ClientDiagram({ model, url, onComment }: DiagramProps) {
  const { items, positions } = model;
  const cards = useMemo(() => clientCardsOf(items), [items]);
  const nodes = useMemo(() => cards.map(nodeOf), [cards]);
  const relations = useMemo(() => clientRelationsOf(items), [items]);
  const { initialZoom, compact, onZoomChange } = useDiagramZoom();
  const selected = items.find((table) => table.id === url.sel);
  if (items.length === 0) {
    return (
      <EmptyState
        variant="inline"
        bordered
        icon="schema"
        title="Aucune table à afficher"
        description="Le diagramme se remplit dès qu'une table est enregistrée."
      />
    );
  }
  const names = new Map(items.map((table) => [table.id, table.name]));
  return (
    <div className="flex flex-wrap gap-4 xl:flex-nowrap">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="m-0 flex-1 text-caption text-muted-foreground">
            {compact ? HINT_COMPACT : HINT}
          </p>
          <Legend />
        </div>
        <DiagramViewer<TableNode>
          label="Diagramme entité-relation"
          nodes={nodes}
          relations={relations}
          renderNode={renderTable}
          selectedId={selected?.id ?? null}
          onSelect={url.select}
          positions={positions}
          initialZoom={initialZoom}
          onZoomChange={onZoomChange}
          className={VIEWER_HEIGHT}
        />
      </div>
      {selected ? (
        <FicheFrame id={selected.id} onClose={url.dropSelection}>
          <DataClientFiche
            table={selected}
            links={relations.filter((r) => r.from === selected.id || r.to === selected.id)}
            nameOf={(id) => names.get(id) ?? id}
            onComment={onComment ? () => onComment(selected.id) : undefined}
          />
        </FicheFrame>
      ) : null}
    </div>
  );
}

const countOf = (n: number): string => `${n} ${n >= 2 ? "tables" : "table"}`;

function Row({ table, onOpen }: { table: ClientDataTable; onOpen: (id: string) => void }) {
  return (
    <TableRow data-spec-id={table.id} className="h-[52px]">
      <TableHead scope="row" className="font-medium">
        <span className="flex items-center gap-2">
          <IdTag>{table.id}</IdTag>
          <button
            type="button"
            onClick={() => onOpen(table.id)}
            aria-label={`Voir la fiche de ${table.id}, ${table.name}`}
            className="rounded-sm text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11"
          >
            {table.name}
          </button>
        </span>
      </TableHead>
      <TableCell className="text-meta text-muted-foreground">{table.zone ?? "—"}</TableCell>
      <TableCell className="text-meta text-muted-foreground">{table.fields.length}</TableCell>
      <TableCell className="text-meta text-muted-foreground">{table.relations.length}</TableCell>
      <TableCell className="font-mono text-code">
        {usedByText(table.usedBy.map((link) => link.id))}
      </TableCell>
      <TableCell>
        <PersonalPill personal={table.fields.some((field) => field.personalData)} />
      </TableCell>
    </TableRow>
  );
}

/** Onglet Tables (maquette 11 l.234-246) : le même tableau que l'équipe, une ligne ouvre la fiche dans le diagramme. */
export function ClientTables({
  model,
  onOpen,
}: {
  model: ClientSpaceDataModel;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-meta text-muted-foreground">
        <span className="font-semibold text-foreground">{countOf(model.items.length)}</span>
        {model.truncated ? ` · ${TRUNCATED_NOTE(model.items.length)}` : null}
      </p>
      <Table framed stickyHeader frameLabel={TABLES_TABLE_LABEL} aria-label={TABLES_TABLE_LABEL}>
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
          {model.items.map((table) => (
            <Row key={table.id} table={table} onOpen={onOpen} />
          ))}
        </TableBody>
      </Table>
      <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <Icon name="shield" size={16} aria-hidden="true" />
        {DATA_PERSONAL_NOTE}
      </p>
    </div>
  );
}

type Fixture = NonNullable<ReturnType<typeof useClientFixtures>["data"]>["items"][number];

function ClientFixture({ projectId, fixture }: { projectId: string; fixture: Fixture }) {
  const rows = useClientFixtureRows(projectId, fixture.specId);
  return <FixtureBlock fixture={fixture} rows={rows} />;
}

/** Onglet Jeux d'exemple (maquette 11 l.248-261) : phrase d'aide, une section par jeu, lignes fictives paginées par 25. */
export function ClientFixtures({ projectId }: { projectId: string }) {
  const fixtures = useClientFixtures(projectId, true);
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-meta text-muted-foreground">{DATA_FIXTURES_HELP}</p>
      {fixtures.isError ? (
        <ErrorNotice
          title="Impossible de charger les jeux d'exemple"
          onRetry={() => void fixtures.refetch()}
        >
          Les jeux d'exemple n'ont pas pu être lus.
        </ErrorNotice>
      ) : fixtures.isPending ? (
        <Skeleton aria-busy="true" className="h-40 rounded-xl" />
      ) : fixtures.data.items.length === 0 ? (
        <EmptyState
          variant="inline"
          bordered
          icon="dataset"
          title="Aucun jeu d'exemple"
          description="Les jeux d'exemple sont des lignes fictives, typées d'après les tables."
        />
      ) : (
        fixtures.data.items.map((fixture) => (
          <ClientFixture key={fixture.specId} projectId={projectId} fixture={fixture} />
        ))
      )}
    </div>
  );
}
