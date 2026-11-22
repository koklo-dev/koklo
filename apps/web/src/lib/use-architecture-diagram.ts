"use client";

import { type DiagramPoint, useToast } from "@koklo/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ArchNode,
  type ArchZoneDetail,
  type ArchZoneEntry,
  ghostsOf,
  nodesOf,
  positionsOf,
  relationsOf,
  usesZoneView,
  zoneNodesOf,
  zoneRelationsOf,
} from "./architecture-diagram.ts";
import { orpc } from "./orpc.ts";
import {
  useAllZoneDetails,
  useArchitectureZone,
  useArchitectureZones,
  useZoneOfComponent,
} from "./use-architecture-zones.ts";

/** Dépôt des positions 600 ms après le dernier glisser (B418, repris pour l'architecture, B542). */
const SAVE_DELAY_MS = 600;
const COORD_MAX = 20000;
const clamp = (value: number): number => Math.min(COORD_MAX, Math.max(0, Math.round(value)));
const SAVEABLE = /^(C|RL)-/;

/**
 * Enregistrement des positions : tout le plan (celles du dépôt et les déplacées) part 600 ms après le dernier geste
 * (`spec.architecture.layout.save`, dernier écrit gagne). Un échec garde le nœud à sa place à l'écran (toast).
 */
function useLayoutSave(
  projectId: string,
  saved: Readonly<Record<string, DiagramPoint>> | undefined,
) {
  const { toast } = useToast();
  const [moved, setMoved] = useState<Record<string, DiagramPoint>>({});
  const plan = useRef<Record<string, DiagramPoint>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positions = useMemo(() => ({ ...saved, ...moved }), [saved, moved]);
  plan.current = positions;

  const flush = useCallback(async () => {
    timer.current = null;
    try {
      await orpc.spec.architecture.layout.save.call({
        projectId,
        idempotencyKey: crypto.randomUUID(),
        positions: plan.current,
      });
    } catch {
      toast({ tone: "error", title: "Mise en page non enregistrée" });
    }
  }, [projectId, toast]);

  const move = useCallback(
    (id: string, point: DiagramPoint, view: Readonly<Record<string, DiagramPoint>> = {}) => {
      const next: Record<string, DiagramPoint> = {};
      for (const [key, at] of Object.entries({ ...view, [id]: point })) {
        if (SAVEABLE.test(key)) next[key] = { x: clamp(at.x), y: clamp(at.y) };
      }
      plan.current = { ...plan.current, ...next };
      setMoved((prev) => ({ ...prev, ...next }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );
  // Quitter l'onglet pendant l'attente ne perd pas le dernier geste.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    [flush],
  );
  return { positions, move };
}

interface Args {
  projectId: string;
  /** `?zone=` (libellé de la zone ouverte) et `?sel=` (nœud choisi). */
  zone: string | undefined;
  sel: string | undefined;
  enabled: boolean;
}

/**
 * Zones lues du serveur, zone ouverte et détails : le diagramme s'ouvre par zones dès 3 zones au-delà de 12 composants,
 * ou au-delà de 25 composants en plusieurs zones (B632).
 */
function useZonesState({ projectId, zone, sel, enabled }: Args) {
  const zones = useArchitectureZones(projectId, enabled);
  const entries = useMemo<ArchZoneEntry[]>(() => zones.data?.zones ?? [], [zones.data]);
  const total = zones.data?.componentCount ?? 0;
  const zoned = zones.isSuccess && usesZoneView(total, entries.length);
  const direct = useZoneOfComponent(projectId, sel, enabled && zoned && zone === undefined);
  const asked = zone ?? direct;
  const open = zoned ? (entries.find((entry) => entry.name === asked) ?? null) : null;
  const openDetail = useArchitectureZone(projectId, open?.id ?? null);
  const all = useAllZoneDetails(
    projectId,
    entries.map((entry) => entry.id),
    enabled && zones.isSuccess && !zoned,
  );
  return { zones, entries, total, zoned, open, openDetail, all };
}

type ZonesState = ReturnType<typeof useZonesState>;

/** Nœuds, liens et positions du diagramme affiché : la zone ouverte et ses voisines, ou toutes les zones. */
function useDiagramParts(
  state: ZonesState,
  saved: Readonly<Record<string, DiagramPoint>> | undefined,
) {
  const { zoned, openDetail, all, entries } = state;
  const opened = openDetail.data as ArchZoneDetail | undefined;
  const details = useMemo<ArchZoneDetail[]>(
    () => (zoned ? (opened ? [opened] : []) : (all.details as ArchZoneDetail[])),
    [zoned, opened, all.details],
  );
  const ghosts = useMemo(
    () => (zoned && opened ? ghostsOf(opened, entries) : []),
    [zoned, opened, entries],
  );
  const nodes = useMemo<ArchNode[]>(() => nodesOf(details, ghosts), [details, ghosts]);
  const zoneNames = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry.name])),
    [entries],
  );
  return {
    nodes,
    relations: useMemo(() => relationsOf(details, nodes, zoneNames), [details, nodes, zoneNames]),
    positions: useMemo(() => positionsOf(nodes, saved ?? {}), [nodes, saved]),
  };
}

/**
 * Données de l'onglet Schéma : les zones (`spec.architecture.zones`), puis la zone ouverte (`spec.architecture.zone`)
 * ou, quand l'architecture tient dans un cadre, toutes les zones à la fois ; positions enregistrées
 * (`spec.architecture.layout.get`, vides si le fichier est absent). Une zone ouverte montre en plus une carte estompée
 * par zone voisine (B547) ; un composant choisi par lien direct ouvre sa zone.
 */
export function useArchitectureDiagram(args: Args) {
  const state = useZonesState(args);
  const { zones, entries, total, zoned, open, openDetail, all } = state;
  const layout = useQuery({
    ...orpc.spec.architecture.layout.get.queryOptions({ input: { projectId: args.projectId } }),
    enabled: args.enabled,
  });
  const { positions: saved, move } = useLayoutSave(args.projectId, layout.data?.positions);
  const parts = useDiagramParts(state, saved);
  return {
    zoned,
    overview: zoned && open === null,
    open: open?.name ?? null,
    entries,
    zoneNodes: useMemo(() => zoneNodesOf(entries), [entries]),
    zoneRelations: useMemo(() => zoneRelationsOf(entries), [entries]),
    total,
    count: open ? open.componentCount : total,
    crossLinks: (openDetail.data?.outgoing ?? []).reduce((sum, link) => sum + link.count, 0),
    ...parts,
    move,
    loading: zones.isPending,
    error: zones.isError,
    retry: () => void zones.refetch(),
    zoneLoading: open !== null && openDetail.isPending,
    zoneFailed: open !== null && openDetail.isError,
    retryZone: () => void openDetail.refetch(),
    detailsLoading: !zoned && all.pending,
    detailsFailed: !zoned && all.failed,
    retryDetails: all.retry,
  };
}

export type ArchitectureDiagram = ReturnType<typeof useArchitectureDiagram>;
