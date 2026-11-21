"use client";

import { ArchNodeCard, cn, DiagramViewer, EmptyState, Icon, Skeleton } from "@koklo/ui";
import { useEffect, useMemo, useState } from "react";
import {
  type ArchNode,
  type ArchZoneNode,
  bandsOf,
  componentsLabel,
  ghostZoneOf,
  HINT,
  HINT_COMPACT,
  isGhostId,
  LEGEND,
  zoneGridPositions,
  zoneHint,
} from "../lib/architecture-diagram.ts";
import { canWriteArchitecture } from "../lib/roles.ts";
import {
  type ArchitectureDiagram,
  useArchitectureDiagram,
} from "../lib/use-architecture-diagram.ts";
import type { ArchitecturePageModel } from "../lib/use-architecture-page.ts";
import { useArchitectureSearch } from "../lib/use-architecture-zones.ts";
import { useDiagramFullscreen } from "../lib/use-diagram-fullscreen.ts";
import { SchemaFiche } from "./architecture-schema-fiche.tsx";
import {
  ARCHITECTURE_NOUNS,
  ArchZoneCardList,
  renderArchZone,
} from "./architecture-schema-zones.tsx";
import { FicheFrame, useDiagramZoom, VIEWER_HEIGHT } from "./data-diagram-parts.tsx";
import { ZoneBar } from "./data-diagram-zones.tsx";
import { ErrorNotice } from "./error-notice.tsx";

const FULL_HEIGHT = "h-[max(420px,calc(100dvh-112px))]";
const BANDS = bandsOf();

type Fullscreen = ReturnType<typeof useDiagramFullscreen>;

/** Légende (maquette 13 l.179-183) : une icône par forme et le trait pointillé des appels asynchrones. */
function Legend() {
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 text-caption font-normal text-muted-foreground">
      {LEGEND.map((entry) => (
        <li key={entry.label} className="inline-flex items-center gap-1.5">
          <Icon name={entry.icon} size={16} aria-hidden="true" />
          {entry.label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="w-[22px] border-muted-foreground border-t-[1.5px] border-dashed"
        />
        asynchrone
      </li>
    </ul>
  );
}

/** Rendu d'un nœud ; ceux que l'impact amont concerne (architecture à revoir) portent le contour ambre (B587). */
const nodeRenderer =
  (stale: ReadonlySet<string>) =>
  (
    node: ArchNode,
    context: { selected: boolean; ghost: boolean; compact: boolean; onSelect: () => void },
  ) => (
    <ArchNodeCard
      kind={node.kind}
      name={node.name}
      subtitle={node.subtitle}
      selected={context.selected}
      ghost={context.ghost}
      compact={context.compact}
      stale={stale.has(node.id)}
      onSelect={context.onSelect}
    />
  );

/** Lecteur des nœuds : composants et acteurs par couches, zones voisines estompées, glisser enregistré (équipe). */
function NodesViewer({
  page,
  diagram,
  zoom,
  selectedId,
  fullscreen,
}: {
  page: ArchitecturePageModel;
  diagram: ArchitectureDiagram;
  zoom: ReturnType<typeof useDiagramZoom>;
  selectedId: string | null;
  fullscreen: Fullscreen;
}) {
  const ghostIds = useMemo(
    () => new Set(diagram.nodes.filter((node) => isGhostId(node.id)).map((node) => node.id)),
    [diagram.nodes],
  );
  const canMove = canWriteArchitecture(page.role);
  const renderNode = useMemo(
    () => nodeRenderer(new Set(page.upstream.components)),
    [page.upstream.components],
  );
  return (
    <DiagramViewer<ArchNode>
      key={diagram.open ?? "tout"}
      label={diagram.open ? `Schéma d'architecture, zone ${diagram.open}` : "Schéma d'architecture"}
      nodes={diagram.nodes}
      relations={diagram.relations}
      bands={BANDS}
      ghostIds={ghostIds}
      renderNode={renderNode}
      selectedId={selectedId}
      onSelect={(id) => (isGhostId(id) ? page.url.openZone(ghostZoneOf(id)) : page.url.select(id))}
      positions={diagram.positions}
      onMove={
        canMove
          ? (id, point, plan) => {
              if (!isGhostId(id)) diagram.move(id, point, plan);
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

/** Vue des zones : une carte par zone, reliées par le nombre de liens entre elles ; un clic ouvre la zone. */
function ZonesViewer({
  page,
  diagram,
  fullscreen,
}: {
  page: ArchitecturePageModel;
  diagram: ArchitectureDiagram;
  fullscreen: Fullscreen;
}) {
  return (
    <>
      <ArchZoneCardList nodes={diagram.zoneNodes} onOpen={(name) => page.url.openZone(name)} />
      <DiagramViewer<ArchZoneNode>
        key="zones"
        positions={zoneGridPositions(diagram.zoneNodes)}
        label="Schéma par zones"
        nodes={diagram.zoneNodes}
        relations={diagram.zoneRelations}
        renderNode={(node, context) => renderArchZone(node, context)}
        onSelect={(id) => {
          const zone = diagram.zoneNodes.find((node) => node.id === id);
          if (zone) page.url.openZone(zone.zone.name);
        }}
        minimap
        fullscreen={fullscreen}
        className={cn("max-md:hidden", fullscreen.active ? FULL_HEIGHT : VIEWER_HEIGHT)}
      />
    </>
  );
}

/** Fil et « Aller à un composant… » : la saisie reste ici, le serveur cherche 200 ms après la dernière frappe. */
function ZoneNav({ page, diagram }: { page: ArchitecturePageModel; diagram: ArchitectureDiagram }) {
  const [jump, setJump] = useState("");
  const search = useArchitectureSearch(page.projectId, jump);
  return (
    <ZoneBar
      nouns={ARCHITECTURE_NOUNS}
      crumbs={diagram.zoned}
      total={diagram.total}
      zone={diagram.open}
      count={diagram.count}
      crossLinks={diagram.crossLinks}
      value={jump}
      onValueChange={setJump}
      result={search}
      onAll={() => page.url.openZone(null)}
      onPick={(item) =>
        diagram.zoned && item.zone
          ? page.url.openZone(item.zone, item.id)
          : page.url.select(item.id)
      }
    />
  );
}

function ZoneStatus({ diagram }: { diagram: ArchitectureDiagram }) {
  if (diagram.zoneFailed || diagram.detailsFailed) {
    return (
      <ErrorNotice
        title="Impossible de charger la zone"
        onRetry={diagram.zoneFailed ? diagram.retryZone : diagram.retryDetails}
      >
        Les composants n'ont pas pu être lus.
      </ErrorNotice>
    );
  }
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Chargement du schéma…</span>
      <Skeleton className={`${VIEWER_HEIGHT} w-full rounded-xl`} />
    </div>
  );
}

function hintOf(diagram: ArchitectureDiagram, compact: boolean): string {
  if (diagram.overview) return zoneHint(diagram.total, diagram.zoneNodes.length);
  return compact ? HINT_COMPACT : HINT;
}

/** Fiche du nœud choisi, dans son cadre (panneau superposé sous 1280 px, `aside` au-delà). */
function FichePanel({
  page,
  node,
  onClose,
}: {
  page: ArchitecturePageModel;
  node: ArchNode | undefined;
  onClose: () => void;
}) {
  if (!node) return null;
  return (
    <FicheFrame
      id={node.id}
      onClose={onClose}
      label="Fiche du composant"
      description="Responsabilité, liens et fichiers du composant choisi dans le schéma."
    >
      <SchemaFiche
        projectId={page.projectId}
        id={node.id}
        name={node.name}
        type={node.kind === "actor" ? undefined : node.kind}
        onEdit={page.form.canWrite ? () => page.form.openEdit(node.id) : undefined}
        {...(page.upstream.components.includes(node.id) ? { staleIds: page.upstream.ids } : {})}
      />
    </FicheFrame>
  );
}

/** Annonce « Zone X ouverte · 9 composants » dans la région d'état de la page (une fois les composants lus). */
function useZoneAnnouncement(page: ArchitecturePageModel, diagram: ArchitectureDiagram) {
  const { announce } = page;
  const { open, count, zoneLoading } = diagram;
  useEffect(() => {
    if (open !== null && !zoneLoading) announce(`Zone ${open} ouverte · ${componentsLabel(count)}`);
  }, [open, count, zoneLoading, announce]);
}

function Reader({
  page,
  diagram,
  zoom,
  selectedId,
  fullscreen,
}: {
  page: ArchitecturePageModel;
  diagram: ArchitectureDiagram;
  zoom: ReturnType<typeof useDiagramZoom>;
  selectedId: string | null;
  fullscreen: Fullscreen;
}) {
  if (diagram.overview)
    return <ZonesViewer page={page} diagram={diagram} fullscreen={fullscreen} />;
  if (
    diagram.zoneLoading ||
    diagram.zoneFailed ||
    diagram.detailsLoading ||
    diagram.detailsFailed
  ) {
    return <ZoneStatus diagram={diagram} />;
  }
  return (
    <NodesViewer
      page={page}
      diagram={diagram}
      zoom={zoom}
      selectedId={selectedId}
      fullscreen={fullscreen}
    />
  );
}

/** Lecteur, aide, légende et fiche : monté une fois les zones lues (le zoom d'ouverture se décide côté navigateur). */
function SchemaReader({
  page,
  diagram,
}: {
  page: ArchitecturePageModel;
  diagram: ArchitectureDiagram;
}) {
  const zoom = useDiagramZoom();
  const fullscreen = useDiagramFullscreen();
  useZoneAnnouncement(page, diagram);
  const { sel } = page.url;
  const selected = !diagram.overview ? diagram.nodes.find((node) => node.id === sel) : undefined;
  const selectedId = selected && !isGhostId(selected.id) ? selected.id : null;
  return (
    <div
      data-fullscreen={fullscreen.active || undefined}
      className={cn(
        "flex flex-wrap gap-4 xl:flex-nowrap",
        fullscreen.active && "fixed inset-0 z-50 overflow-auto bg-background p-4",
      )}
    >
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5">
        <ZoneNav page={page} diagram={diagram} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="m-0 min-w-0 flex-auto text-caption font-normal text-muted-foreground">
            {hintOf(diagram, zoom.compact)}
          </p>
          <Legend />
        </div>
        <Reader
          page={page}
          diagram={diagram}
          zoom={zoom}
          selectedId={selectedId}
          fullscreen={fullscreen}
        />
      </div>
      <FichePanel
        page={page}
        node={selectedId ? selected : undefined}
        onClose={page.url.dropSelection}
      />
    </div>
  );
}

function SchemaLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Chargement du schéma…</span>
      <Skeleton className={`${VIEWER_HEIGHT} w-full rounded-xl`} />
    </div>
  );
}

/**
 * Onglet Schéma (maquette 13 l.175-239) : composants et acteurs en quatre couches (Utilisateurs, Applications,
 * Services, Données et services externes), liens étiquetés, appels asynchrones en pointillés, mini-carte, zoom, fiche
 * Fiche · YAML · Mermaid. Plus de 25 composants en plusieurs zones : vue des zones d'abord, puis la zone ouverte avec
 * ses voisines estompées. Équipe : glisser enregistré dans `architecture/_layout.yaml` ; designer : lecture seule.
 */
export function ArchitectureSchemaTab({ page }: { page: ArchitecturePageModel }) {
  const diagram = useArchitectureDiagram({
    projectId: page.projectId,
    zone: page.url.zone,
    sel: page.url.sel,
    enabled: page.team,
  });
  if (diagram.error) {
    return (
      <ErrorNotice title="Impossible de charger le schéma" onRetry={diagram.retry}>
        L'architecture n'a pas pu être lue. Réessayez dans un instant.
      </ErrorNotice>
    );
  }
  if (diagram.loading) return <SchemaLoading />;
  if (diagram.total === 0) {
    return (
      <EmptyState
        variant="inline"
        bordered
        icon="hub"
        title="Aucun composant à afficher"
        description="Le schéma se remplit dès qu'un composant est enregistré."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <SchemaReader page={page} diagram={diagram} />
    </div>
  );
}
