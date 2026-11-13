"use client";

import { cn, DiagramViewer, EmptyState, Skeleton } from "@koklo/ui";
import { useMemo } from "react";
import {
  crossLinkCount,
  isNeighborId,
  type NeighborNode,
  neighborsOf,
  neighborZoneOf,
  positionsForView,
  usesZoneView,
  type ZoneNode,
  zoneNodeOf,
  zoneOfCard,
  zoneRelationsOf,
  zonesOf,
} from "../lib/data-diagram-zones.ts";
import { canWriteData } from "../lib/roles.ts";
import { type TableNode, useDataDiagram } from "../lib/use-data-diagram.ts";
import type { DataPageModel } from "../lib/use-data-page.ts";
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
import { renderNeighbor, renderZone, ZoneBar, zoneHint } from "./data-diagram-zones.tsx";
import { ErrorNotice } from "./error-notice.tsx";

const HINT = "Cliquez une table pour voir sa fiche.";
const HINT_REVIEW =
  "Pointillés : proposition à relire · estompée : rejetée. Les décisions se prennent dans l'onglet Relecture.";

type Diagram = ReturnType<typeof useDataDiagram>;

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

/**
 * Vue courante du diagramme par zones (B478, DESIGN.md §5.3 schéma 1.3) : au-delà de 25 tables en plusieurs zones, la
 * vue des zones, puis les tables de la zone ouverte (`?zone=`). Une table choisie par lien direct (`?sel=`) ouvre sa
 * zone. Sous le seuil : toutes les tables, sans fil.
 */
function useZoneView(page: DataPageModel, diagram: Diagram) {
  const zones = useMemo(() => zonesOf(diagram.cards), [diagram.cards]);
  const zoned = usesZoneView(diagram.cards, zones);
  const selected = diagram.cards.find((card) => card.id === page.url.sel);
  const asked = zones.find((zone) => zone.id === page.url.zone)?.id;
  const open = zoned ? (asked ?? (selected ? zoneOfCard(selected) : null)) : null;
  const nodes = useMemo(
    () =>
      open === null
        ? diagram.nodes
        : diagram.nodes.filter((node) => zoneOfCard(node.card) === open),
    [diagram.nodes, open],
  );
  return {
    zoned,
    zones,
    open,
    overview: zoned && open === null,
    nodes,
    count: nodes.length,
    crossLinks: open === null ? 0 : crossLinkCount(open, diagram.relations, diagram.cards),
    neighbors: useMemo(
      () =>
        open === null
          ? { nodes: [], relations: [] }
          : neighborsOf(open, diagram.relations, diagram.cards),
      [open, diagram.relations, diagram.cards],
    ),
    zoneNodes: useMemo(() => zones.map(zoneNodeOf), [zones]),
    zoneRelations: useMemo(
      () => zoneRelationsOf(diagram.relations, diagram.cards),
      [diagram.relations, diagram.cards],
    ),
  };
}

type ZoneView = ReturnType<typeof useZoneView>;

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
    () => [...view.nodes, ...view.neighbors.nodes],
    [view.nodes, view.neighbors],
  );
  const relations = useMemo(
    () => [...diagram.relations, ...view.neighbors.relations],
    [diagram.relations, view.neighbors],
  );
  const canMove = canWriteData(page.role);
  const positions = useMemo(
    () =>
      positionsForView(
        diagram.positions,
        view.nodes.map((node) => node.id),
      ),
    [diagram.positions, view.nodes],
  );
  return (
    <DiagramViewer<Shown>
      key={view.open ?? "toutes"}
      label={
        view.open ? `Diagramme entité-relation, zone ${view.open}` : "Diagramme entité-relation"
      }
      nodes={nodes}
      relations={relations}
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
  return (
    <DiagramViewer<ZoneNode>
      key="zones"
      label="Diagramme par zones"
      nodes={view.zoneNodes}
      relations={view.zoneRelations}
      renderNode={(node, context) => renderZone(node, context, reviewing)}
      onSelect={(zone) => page.url.openZone(zone)}
      minimap
      fullscreen={fullscreen}
      className={fullscreen.active ? FULL_HEIGHT : VIEWER_HEIGHT}
    />
  );
}

/** Aide au-dessus du lecteur : vue des zones, zoom compact, relecture, ou consigne de sélection. */
function hintOf(view: ZoneView, compact: boolean, reviewing: boolean, tables: number): string {
  if (view.overview) return zoneHint(tables, view.zones.length);
  if (compact) return HINT_COMPACT;
  return reviewing ? HINT_REVIEW : HINT;
}

/** Lecteur, aide, légende et fiche : monté une fois le modèle lu (le zoom d'ouverture se décide ici, côté navigateur). */
function DiagramReader({ page, diagram }: { page: DataPageModel; diagram: Diagram }) {
  const zoom = useDiagramZoom();
  const view = useZoneView(page, diagram);
  const fullscreen = useDiagramFullscreen();
  // La sélection vit dans l'adresse (`?sel=`, sans entrée d'historique) : elle survit à un remontage du lecteur.
  const selectedId =
    !view.overview && view.nodes.some((node) => node.id === page.url.sel)
      ? (page.url.sel ?? null)
      : null;
  const hint = hintOf(view, zoom.compact, page.propose.reviewing, diagram.cards.length);
  return (
    <div
      data-fullscreen={fullscreen.active || undefined}
      className={cn(
        "flex flex-wrap gap-4 xl:flex-nowrap",
        fullscreen.active && "fixed inset-0 z-50 overflow-auto bg-background p-4",
      )}
    >
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5">
        {view.zoned ? (
          <ZoneBar
            total={diagram.cards.length}
            zone={view.open}
            count={view.count}
            crossLinks={view.crossLinks}
            cards={diagram.cards}
            onAll={() => page.url.openZone(null)}
            onPick={(card) => page.url.openZone(zoneOfCard(card), card.id)}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="m-0 flex-1 text-caption text-muted-foreground">{hint}</p>
          {view.overview ? null : <Legend />}
        </div>
        {view.overview ? (
          <ZonesViewer page={page} view={view} fullscreen={fullscreen} />
        ) : (
          <TablesViewer
            page={page}
            diagram={diagram}
            view={view}
            zoom={zoom}
            selectedId={selectedId}
            fullscreen={fullscreen}
          />
        )}
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

/**
 * Onglet Diagramme (maquette 11 l.168-206) : lecteur pleine hauteur du modèle enregistré, avec en relecture les
 * tables proposées (pointillés, rejetées estompées), et fiche ancrée de la table choisie. Plus de 25 tables en
 * plusieurs zones : vue des zones d'abord, fil et « Aller à une table… » (B478). Équipe : glisser enregistré
 * dans `data/_layout.yaml` ; designer : lecture seule.
 */
export function DataDiagramTab({ page }: { page: DataPageModel }) {
  const diagram = useDataDiagram(page.projectId, page.propose.reviewing ? page.proposed : []);
  if (diagram.error) {
    return (
      <ErrorNotice title="Impossible de charger le diagramme" onRetry={diagram.retry}>
        Le modèle de données n'a pas pu être lu. Réessayez dans un instant.
      </ErrorNotice>
    );
  }
  if (diagram.loading) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Chargement du diagramme…</span>
        <Skeleton className={`${VIEWER_HEIGHT} w-full rounded-xl`} />
      </div>
    );
  }
  if (diagram.cards.length === 0) {
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
  return <DiagramReader page={page} diagram={diagram} />;
}
