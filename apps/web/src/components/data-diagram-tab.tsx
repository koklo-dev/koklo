"use client";

import { cn, DiagramViewer, EmptyState, InlineAlert, Skeleton } from "@koklo/ui";
import { useEffect, useMemo, useState } from "react";
import {
  isNeighborId,
  type NeighborNode,
  NO_ZONE,
  neighborZoneOf,
  positionsForView,
  tablesLabel,
  type ZoneNode,
  zoneGridPositions,
} from "../lib/data-diagram-zones.ts";
import { canWriteData } from "../lib/roles.ts";
import { type TableNode, useDataDiagram } from "../lib/use-data-diagram.ts";
import type { DataPageModel } from "../lib/use-data-page.ts";
import { useDataSearch } from "../lib/use-data-zones.ts";
import { useDiagramFullscreen } from "../lib/use-diagram-fullscreen.ts";
import { DiagramFiche } from "./data-diagram-fiche.tsx";
import {
  FicheFrame,
  HINT_COMPACT,
  Legend,
  renderTable,
  useDiagramZoom,
  VIEWER_HEIGHT,
} from "./data-diagram-parts.tsx";
import {
  renderNeighbor,
  renderZone,
  ZoneBar,
  ZoneCardList,
  zoneHint,
} from "./data-diagram-zones.tsx";
import { ErrorNotice } from "./error-notice.tsx";

const HINT = "Cliquez une table pour voir sa fiche.";
const HINT_REVIEW =
  "Pointillés : proposition à relire · estompée : rejetée. Les décisions se prennent dans l'onglet Relecture.";

type Diagram = ReturnType<typeof useDataDiagram>;
type ZoneView = Diagram["zoned"];

/** Fiche de la table choisie, dans son cadre (panneau superposé sous 1280 px, `aside` au-delà). */
function FichePanel({
  page,
  diagram,
  selectedId,
  onClose,
}: {
  page: DataPageModel;
  diagram: Diagram;
  selectedId: string | null;
  onClose: () => void;
}) {
  const card = diagram.cards.find((entry) => entry.id === selectedId);
  if (!card) return null;
  const names = new Map(diagram.cards.map((entry) => [entry.id, entry.name]));
  return (
    <FicheFrame id={card.id} onClose={onClose}>
      <DiagramFiche
        projectId={page.projectId}
        card={card}
        links={diagram.relations.filter((r) => r.from === card.id || r.to === card.id)}
        nameOf={(id) => names.get(id) ?? id}
        mermaid={diagram.mermaidText}
        onEdit={page.form.canWrite ? () => page.form.openEdit(card.id) : undefined}
      />
    </FicheFrame>
  );
}

type Fullscreen = ReturnType<typeof useDiagramFullscreen>;
type Shown = TableNode | NeighborNode;

const renderShown = (node: Shown, context: Parameters<typeof renderTable>[1]) =>
  "card" in node ? renderTable(node, context) : renderNeighbor(node, context);

/** Plein écran : le lecteur prend la hauteur de la fenêtre, moins le fil et l'aide. */
const FULL_HEIGHT = "h-[max(420px,calc(100dvh-112px))]";

/**
 * Lecteur des tables (toutes, ou celles de la zone ouverte et ses zones voisines, B480) : sélection, glisser
 * enregistré (tables seulement), mini-carte, plein écran.
 */
function TablesViewer({
  page,
  diagram,
  view,
  zoom,
  selectedId,
  fullscreen,
}: {
  page: DataPageModel;
  diagram: Diagram;
  view: ZoneView;
  zoom: ReturnType<typeof useDiagramZoom>;
  selectedId: string | null;
  fullscreen: Fullscreen;
}) {
  const nodes = useMemo<Shown[]>(
    () => [...diagram.nodes, ...view.neighbors],
    [diagram.nodes, view.neighbors],
  );
  const canMove = canWriteData(page.role);
  const positions = useMemo(
    () =>
      positionsForView(
        diagram.positions,
        diagram.nodes.map((node) => node.id),
      ),
    [diagram.positions, diagram.nodes],
  );
  return (
    <DiagramViewer<Shown>
      key={view.open ?? "toutes"}
      label={
        view.open ? `Diagramme entité-relation, zone ${view.open}` : "Diagramme entité-relation"
      }
      nodes={nodes}
      relations={diagram.relations}
      renderNode={renderShown}
      selectedId={selectedId}
      onSelect={(id) =>
        isNeighborId(id) ? page.url.openZone(neighborZoneOf(id)) : page.url.select(id)
      }
      positions={positions}
      // Toute la vue est enregistrée (B481) ; une zone voisine se déplace à l'écran sans l'être : `_layout.yaml`
      // ne garde que des tables.
      onMove={
        canMove
          ? (id, point, plan) => {
              if (!isNeighborId(id)) diagram.move(id, point, plan);
            }
          : undefined
      }
      initialZoom={zoom.initialZoom}
      onZoomChange={zoom.onZoomChange}
      minimap
      fullscreen={fullscreen}
      className={fullscreen.active ? FULL_HEIGHT : VIEWER_HEIGHT}
    />
  );
}

/** Vue des zones : une carte par zone, reliées par le nombre de relations entre elles ; un clic ouvre la zone. */
function ZonesViewer({
  page,
  view,
  fullscreen,
}: {
  page: DataPageModel;
  view: ZoneView;
  fullscreen: Fullscreen;
}) {
  const reviewing = page.propose.reviewing;
  const open = (name: string) => page.url.openZone(name);
  return (
    <>
      <ZoneCardList nodes={view.zoneNodes} reviewing={reviewing} onOpen={open} />
      <DiagramViewer<ZoneNode>
        key="zones"
        positions={zoneGridPositions(view.zoneNodes)}
        label="Diagramme par zones"
        nodes={view.zoneNodes}
        relations={view.zoneRelations}
        renderNode={(node, context) => renderZone(node, context, reviewing)}
        onSelect={(id) => {
          const zone = view.zoneNodes.find((node) => node.id === id);
          if (zone) page.url.openZone(zone.name);
        }}
        minimap
        fullscreen={fullscreen}
        className={cn("max-md:hidden", fullscreen.active ? FULL_HEIGHT : VIEWER_HEIGHT)}
      />
    </>
  );
}

/** Aide au-dessus du lecteur : vue des zones, zoom compact, relecture, ou consigne de sélection. */
function hintOf(view: ZoneView, compact: boolean, reviewing: boolean, tables: number): string {
  if (view.overview) return zoneHint(tables, view.zoneNodes.length);
  if (compact) return HINT_COMPACT;
  return reviewing ? HINT_REVIEW : HINT;
}

/** Annonce « Zone X ouverte · 9 tables » dans la région d'état de la page (une fois les tables de la zone lues). */
function useZoneAnnouncement(page: DataPageModel, view: ZoneView) {
  const { announce } = page;
  const { open, count, zoneLoading } = view;
  useEffect(() => {
    if (open !== null && !zoneLoading) announce(`Zone ${open} ouverte · ${tablesLabel(count)}`);
  }, [open, count, zoneLoading, announce]);
}

/** Zone ouverte : chargement des tables, ou lecture en échec avec « Réessayer ». */
function ZoneStatus({ view }: { view: ZoneView }) {
  if (view.zoneFailed) {
    return (
      <ErrorNotice title="Impossible de charger la zone" onRetry={view.retryZone}>
        Les tables de cette zone n'ont pas pu être lues.
      </ErrorNotice>
    );
  }
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Chargement de la zone…</span>
      <Skeleton className={`${VIEWER_HEIGHT} w-full rounded-xl`} />
    </div>
  );
}

/** Fil et « Aller à une table… » : la saisie reste ici, le serveur cherche 200 ms après la dernière frappe. */
function ZoneNav({ page, view }: { page: DataPageModel; view: ZoneView }) {
  const [jump, setJump] = useState("");
  const search = useDataSearch(page.projectId, jump);
  return (
    <ZoneBar
      total={view.total}
      zone={view.open}
      count={view.count}
      crossLinks={view.crossLinks}
      value={jump}
      onValueChange={setJump}
      result={search}
      onAll={() => page.url.openZone(null)}
      onPick={(item) => page.url.openZone(item.zone ?? NO_ZONE, item.id)}
    />
  );
}

/** Lecteur courant : vue des zones, tables de la zone ouverte (ou chargement, ou échec), ou toutes les tables. */
function ReaderViewer(props: {
  page: DataPageModel;
  diagram: Diagram;
  zoom: ReturnType<typeof useDiagramZoom>;
  selectedId: string | null;
  fullscreen: Fullscreen;
}) {
  const view = props.diagram.zoned;
  if (view.overview)
    return <ZonesViewer page={props.page} view={view} fullscreen={props.fullscreen} />;
  if (view.zoneLoading || view.zoneFailed) return <ZoneStatus view={view} />;
  return <TablesViewer {...props} view={view} />;
}

/** Lecteur, aide, légende et fiche : monté une fois le modèle lu (le zoom d'ouverture se décide ici, côté navigateur). */
function DiagramReader({ page, diagram }: { page: DataPageModel; diagram: Diagram }) {
  const zoom = useDiagramZoom();
  const view = diagram.zoned;
  const fullscreen = useDiagramFullscreen();
  useZoneAnnouncement(page, view);
  // La sélection vit dans l'adresse (`?sel=`, sans entrée d'historique) : elle survit à un remontage du lecteur.
  const selectedId =
    !view.overview && diagram.nodes.some((node) => node.id === page.url.sel)
      ? (page.url.sel ?? null)
      : null;
  const hint = hintOf(view, zoom.compact, page.propose.reviewing, view.total);
  return (
    <div
      data-fullscreen={fullscreen.active || undefined}
      className={cn(
        "flex flex-wrap gap-4 xl:flex-nowrap",
        fullscreen.active && "fixed inset-0 z-50 overflow-auto bg-background p-4",
      )}
    >
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5">
        {view.zoned ? <ZoneNav page={page} view={view} /> : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="m-0 flex-1 text-caption text-muted-foreground">{hint}</p>
          <Legend />
        </div>
        <ReaderViewer
          page={page}
          diagram={diagram}
          zoom={zoom}
          selectedId={selectedId}
          fullscreen={fullscreen}
        />
      </div>
      <FichePanel
        page={page}
        diagram={diagram}
        selectedId={selectedId}
        onClose={page.url.dropSelection}
      />
    </div>
  );
}

/** Chargement du diagramme : six cartes squelettes (les zones), annoncées une fois (`motion-safe`). */
function DiagramLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Chargement du diagramme…</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: six cartes identiques, sans identité
          <Skeleton key={index} className="h-[180px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Onglet Diagramme (maquette 11 l.168-206) : lecteur pleine hauteur du modèle enregistré, avec en relecture les
 * tables proposées (pointillés, rejetées estompées), et fiche ancrée de la table choisie. Plus de 25 tables en
 * plusieurs zones : vue des zones d'abord (lue du serveur, TK-110), fil et « Aller à une table… » (B478). Équipe :
 * glisser enregistré dans `data/_layout.yaml` ; designer : lecture seule.
 */
export function DataDiagramTab({ page }: { page: DataPageModel }) {
  const diagram = useDataDiagram(page.projectId, page.propose.reviewing ? page.proposed : [], {
    zone: page.url.zone,
    sel: page.url.sel,
  });
  if (diagram.error) {
    return (
      <ErrorNotice title="Impossible de charger le diagramme" onRetry={diagram.retry}>
        Le modèle de données n'a pas pu être lu. Réessayez dans un instant.
      </ErrorNotice>
    );
  }
  if (diagram.loading) return <DiagramLoading />;
  if (!diagram.zoned.zoned && diagram.cards.length === 0) {
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
  return (
    <div className="flex flex-col gap-3">
      {diagram.zoned.zonesFailed ? (
        <InlineAlert
          variant="error"
          icon="warning"
          action={{ label: "Réessayer", onClick: diagram.zoned.retryZones }}
        >
          Impossible de charger les zones.
        </InlineAlert>
      ) : null}
      <DiagramReader page={page} diagram={diagram} />
    </div>
  );
}
