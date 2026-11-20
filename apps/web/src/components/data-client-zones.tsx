"use client";

import type { ClientDataTable } from "@koklo/contract";
import { cn, DiagramViewer, Skeleton } from "@koklo/ui";
import { useMemo, useState } from "react";
import { clientCardsOf, clientRelationsOf } from "../lib/data-client-model.ts";
import { relationsOf } from "../lib/data-diagram.ts";
import {
  crossLinkCount,
  type DiagramZone,
  isNeighborId,
  type NeighborNode,
  NO_ZONE,
  neighborsOf,
  neighborZoneOf,
  type ZoneEntry,
  type ZoneNode,
  zoneGridPositions,
  zoneNodesOf,
} from "../lib/data-diagram-zones.ts";
import { useClientSearch, useClientZone } from "../lib/use-client-data.ts";
import { nodeOf, type TableNode } from "../lib/use-data-diagram.ts";
import type { DataUrl } from "../lib/use-data-url.ts";
import { useDiagramFullscreen } from "../lib/use-diagram-fullscreen.ts";
import { DataClientFiche } from "./data-client-fiche.tsx";
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

type Shown = TableNode | NeighborNode;
const FULL_HEIGHT = "h-[max(420px,calc(100dvh-112px))]";
const HINT = "Cliquez une table pour voir sa fiche.";

const renderShown = (node: Shown, context: Parameters<typeof renderTable>[1]) =>
  "card" in node ? renderTable(node, context) : renderNeighbor(node, context);

interface Props {
  projectId: string;
  zones: readonly ZoneEntry[];
  tableCount: number;
  /** Tables déjà lues (100 au plus) : donnent la zone d'une table choisie par lien direct. */
  known: readonly ClientDataTable[];
  url: DataUrl;
  onComment: ((tableId: string) => void) | undefined;
}

/** Tables de la zone ouverte et zones voisines (lecture seule : pas de glisser, pas de mini-carte des zones). */
function OpenedZone({
  zone,
  detail,
  zones,
  url,
  zoom,
  fullscreen,
  selectedId,
}: {
  zone: DiagramZone;
  detail: ReturnType<typeof useClientZone>;
  zones: readonly ZoneEntry[];
  url: DataUrl;
  zoom: ReturnType<typeof useDiagramZoom>;
  fullscreen: ReturnType<typeof useDiagramFullscreen>;
  selectedId: string | null;
}) {
  const items = detail.data?.items;
  const tables = useMemo(() => clientCardsOf(items ?? []).map(nodeOf), [items]);
  const relations = useMemo(
    () =>
      relationsOf(
        (detail.data?.relations ?? []).map((link, index) => ({ id: `r${index}`, ...link })),
        clientCardsOf(items ?? []),
      ),
    [detail.data, items],
  );
  const neighbors = useMemo(
    () => (detail.data ? neighborsOf(detail.data.outgoing, zones) : []),
    [detail.data, zones],
  );
  if (detail.isError) {
    return (
      <ErrorNotice title="Impossible de charger la zone" onRetry={() => void detail.refetch()}>
        Les tables de cette zone n'ont pas pu être lues.
      </ErrorNotice>
    );
  }
  if (detail.isPending) {
    return <Skeleton aria-busy="true" className={`${VIEWER_HEIGHT} w-full rounded-xl`} />;
  }
  return (
    <DiagramViewer<Shown>
      key={zone.id}
      label={`Diagramme entité-relation, zone ${zone.name}`}
      nodes={[...tables, ...neighbors]}
      relations={relations}
      renderNode={renderShown}
      selectedId={selectedId}
      onSelect={(id) => (isNeighborId(id) ? url.openZone(neighborZoneOf(id)) : url.select(id))}
      initialZoom={zoom.initialZoom}
      onZoomChange={zoom.onZoomChange}
      minimap
      fullscreen={fullscreen}
      className={fullscreen.active ? FULL_HEIGHT : VIEWER_HEIGHT}
    />
  );
}

/** Fil et « Aller à une table… » : la saisie reste ici, le serveur cherche 200 ms après la dernière frappe. */
function ClientNav({
  projectId,
  url,
  tableCount,
  open,
  outgoing,
}: {
  projectId: string;
  url: DataUrl;
  tableCount: number;
  open: DiagramZone | null;
  outgoing: ReadonlyArray<{ count: number }>;
}) {
  const [jump, setJump] = useState("");
  const search = useClientSearch(projectId, jump);
  return (
    <ZoneBar
      total={tableCount}
      zone={open?.name ?? null}
      count={open?.tableCount ?? tableCount}
      crossLinks={crossLinkCount(outgoing)}
      value={jump}
      onValueChange={setJump}
      result={search}
      onAll={() => url.openZone(null)}
      onPick={(item) => url.openZone(item.zone ?? NO_ZONE, item.id)}
    />
  );
}

/** Fiche de la table choisie : le même contenu que le diagramme à plat, sans contrainte ni chemin. */
function ClientZoneFiche({
  items,
  selected,
  url,
  onComment,
}: {
  items: readonly ClientDataTable[];
  selected: ClientDataTable;
  url: DataUrl;
  onComment: Props["onComment"];
}) {
  const names = new Map(items.map((table) => [table.id, table.name]));
  const links = clientRelationsOf(items).filter(
    (r) => r.from === selected.id || r.to === selected.id,
  );
  return (
    <FicheFrame id={selected.id} onClose={url.dropSelection}>
      <DataClientFiche
        table={selected}
        links={links}
        nameOf={(id) => names.get(id) ?? id}
        onComment={onComment ? () => onComment(selected.id) : undefined}
      />
    </FicheFrame>
  );
}

/**
 * Diagramme du modèle validé au-delà de 25 tables en plusieurs zones (TK-110, B482) : mêmes zones, fil et « Aller à
 * une table… » que l'équipe, lus de `clientSpace.dataZones|dataZone|dataSearch`, en lecture seule (pas de glisser).
 */
export function ClientZonedDiagram({ projectId, zones, tableCount, known, url, onComment }: Props) {
  const zoom = useDiagramZoom();
  const fullscreen = useDiagramFullscreen();
  const nodes = useMemo(() => zoneNodesOf(zones, []), [zones]);
  const asked = url.zone ?? known.find((table) => table.id === url.sel)?.zone;
  const open = nodes.find((node) => node.name === asked)?.zone ?? null;
  const detail = useClientZone(projectId, open?.id ?? null);
  const items = detail.data?.items ?? [];
  const selected = items.find((table) => table.id === url.sel);
  return (
    <div
      data-fullscreen={fullscreen.active || undefined}
      className={cn(
        "flex flex-wrap gap-4 xl:flex-nowrap",
        fullscreen.active && "fixed inset-0 z-50 overflow-auto bg-background p-4",
      )}
    >
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5">
        <ClientNav
          projectId={projectId}
          url={url}
          tableCount={tableCount}
          open={open}
          outgoing={detail.data?.outgoing ?? []}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="m-0 flex-1 text-caption text-muted-foreground">
            {hintOf(open === null, tableCount, nodes.length, zoom.compact)}
          </p>
          {open === null ? null : <Legend />}
        </div>
        {open === null ? (
          <ClientZones nodes={nodes} url={url} fullscreen={fullscreen} />
        ) : (
          <OpenedZone
            zone={open}
            detail={detail}
            zones={zones}
            url={url}
            zoom={zoom}
            fullscreen={fullscreen}
            selectedId={selected?.id ?? null}
          />
        )}
      </div>
      {selected ? (
        <ClientZoneFiche items={items} selected={selected} url={url} onComment={onComment} />
      ) : null}
    </div>
  );
}

/** Aide au-dessus du lecteur : vue des zones, zoom compact, ou consigne de sélection. */
function hintOf(overview: boolean, tables: number, zones: number, compact: boolean): string {
  if (overview) return zoneHint(tables, zones);
  return compact ? HINT_COMPACT : HINT;
}

/** Vue des zones : une carte par zone ; un clic l'ouvre. */
function ClientZones({
  nodes,
  url,
  fullscreen,
}: {
  nodes: ZoneNode[];
  url: DataUrl;
  fullscreen: ReturnType<typeof useDiagramFullscreen>;
}) {
  return (
    <>
      <ZoneCardList nodes={nodes} reviewing={false} onOpen={url.openZone} />
      <DiagramViewer<ZoneNode>
        key="zones"
        positions={zoneGridPositions(nodes)}
        label="Diagramme par zones"
        nodes={nodes}
        relations={[]}
        renderNode={(node, context) => renderZone(node, context, false)}
        onSelect={(id) => url.openZone(nodes.find((node) => node.id === id)?.name ?? null)}
        minimap
        fullscreen={fullscreen}
        className={cn("max-md:hidden", fullscreen.active ? FULL_HEIGHT : VIEWER_HEIGHT)}
      />
    </>
  );
}
