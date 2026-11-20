"use client";

import { useMemo } from "react";
import {
  crossLinkCount,
  type DiagramZone,
  type NeighborNode,
  neighborsOf,
  usesZoneView,
  type ZoneEntry,
  zoneCardsOf,
  zoneNodesOf,
  zoneOfCard,
  zoneRelationsOf,
} from "./data-diagram-zones.ts";
import type { DiagramCard, DiagramLink } from "./data-mermaid.ts";
import { useDataZone, useDataZones, useZoneOfTable } from "./use-data-zones.ts";

interface Args {
  projectId: string;
  /** Tables proposées qui ne sont pas encore dans le modèle enregistré. */
  proposedNew: readonly DiagramCard[];
  /** `?zone=` (libellé) et `?sel=` de l'adresse. */
  zone: string | undefined;
  sel: string | undefined;
}

const NONE: NeighborNode[] = [];

/** Zone ouverte : `?zone=`, sinon celle de la table choisie (lecture directe du serveur, ou table proposée). */
function askedZoneOf(
  { zone, sel }: Pick<Args, "zone" | "sel">,
  direct: string | undefined,
  proposedNew: readonly DiagramCard[],
): string | undefined {
  if (zone !== undefined || sel === undefined) return zone;
  const proposed = proposedNew.find((card) => card.id === sel);
  return direct ?? (proposed ? zoneOfCard(proposed) : undefined);
}

/** Tables, relations et zones voisines de la zone ouverte (`spec.data.zone`), tables proposées de la zone comprises. */
function useZoneDetail(
  projectId: string,
  open: DiagramZone | null,
  proposedNew: readonly DiagramCard[],
  entries: readonly ZoneEntry[],
) {
  const detail = useDataZone(projectId, open?.saved ? open.id : null);
  const proposedHere = useMemo(
    () => (open ? proposedNew.filter((card) => zoneOfCard(card) === open.name) : []),
    [open, proposedNew],
  );
  const data = detail.data;
  return {
    cards: useMemo(() => zoneCardsOf(data, proposedHere), [data, proposedHere]),
    links: useMemo<DiagramLink[]>(
      () => (data?.relations ?? []).map((relation, index) => ({ id: `r${index}`, ...relation })),
      [data],
    ),
    crossLinks: crossLinkCount(data?.outgoing ?? []),
    neighbors: useMemo(() => (data ? neighborsOf(data.outgoing, entries) : NONE), [data, entries]),
    loading: open?.saved === true && detail.isPending,
    failed: detail.isError,
    retry: () => void detail.refetch(),
  };
}

/**
 * Diagramme par zones lu du serveur (TK-110, B482) : les zones (`spec.data.zones`), puis les tables de la zone ouverte
 * (`spec.data.zone`) au lieu des 100 premiers noms. Une table choisie par lien direct ouvre sa zone. Au-delà de 25
 * tables en plusieurs zones seulement ; une lecture des zones en échec laisse le diagramme de toutes les tables.
 */
export function useZonedDiagram({ projectId, proposedNew, zone, sel }: Args) {
  const zones = useDataZones(projectId);
  const entries = useMemo<ZoneEntry[]>(() => zones.data?.zones ?? [], [zones.data]);
  const zoneNodes = useMemo(() => zoneNodesOf(entries, proposedNew), [entries, proposedNew]);
  const total = (zones.data?.tableCount ?? 0) + proposedNew.length;
  const zoned = zones.isSuccess && usesZoneView(total, zoneNodes.length);
  const direct = useZoneOfTable(projectId, sel, zoned && zone === undefined);
  const asked = askedZoneOf({ zone, sel }, direct, proposedNew);
  const open = zoned ? (zoneNodes.find((node) => node.name === asked)?.zone ?? null) : null;
  const detail = useZoneDetail(projectId, open, proposedNew, entries);
  return {
    zoned,
    overview: zoned && open === null,
    open: open?.name ?? null,
    cards: detail.cards,
    links: detail.links,
    total,
    count: open ? Math.max(open.tableCount, detail.cards.length) : total,
    zoneNodes,
    zoneRelations: useMemo(() => zoneRelationsOf(entries), [entries]),
    crossLinks: detail.crossLinks,
    neighbors: detail.neighbors,
    pending: zones.isPending,
    zonesFailed: zones.isError,
    retryZones: () => void zones.refetch(),
    zoneLoading: detail.loading,
    zoneFailed: detail.failed,
    retryZone: detail.retry,
  };
}

export type ZonedDiagram = ReturnType<typeof useZonedDiagram>;
