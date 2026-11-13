"use client";

import { type PointerEvent, type ReactNode, useCallback, useMemo, useState } from "react";
import { cn } from "../lib/cn.ts";
import {
  clampPoint,
  type DiagramLayout,
  type DiagramPoint,
  layoutDiagram,
  overlayPositions,
} from "../lib/diagram-layout.ts";
import { zoomPercent } from "../lib/diagram-zoom.ts";
import { useDiagramDrag } from "../lib/use-diagram-drag.ts";
import { useDiagramViewport } from "../lib/use-diagram-viewport.ts";
import { useDiagramZoom } from "../lib/use-diagram-zoom.ts";
import { useIsMobile } from "../lib/use-mobile.ts";
import { DiagramMinimap } from "./diagram-minimap.tsx";
import { type DiagramRelation, DiagramRelations } from "./diagram-relations.tsx";
import { DiagramZoomBar } from "./diagram-zoom-bar.tsx";

export type { DiagramPoint } from "../lib/diagram-layout.ts";
export type { DiagramRelation } from "./diagram-relations.tsx";

/** Nœud du diagramme : de type libre (le contenu vient de `renderNode`), seuls son nom et sa taille sont connus. */
export interface DiagramNode {
  id: string;
  /** Nom lu à l'annonce d'un déplacement (« Réservation déplacée »). */
  name: string;
  width: number;
  height: number;
  /** Groupe imbriqué (`compound`) : prévu par l'API, pas encore dessiné (TK-108, ADR 0022). */
  parentId?: string | undefined;
}

export interface DiagramNodeContext {
  selected: boolean;
  /** Zoom sous 60 % : le contenu se réduit au nom. */
  compact: boolean;
  onSelect: () => void;
}

export interface DiagramViewerProps<T extends DiagramNode> {
  /** Nom de la région focusable du lecteur. */
  label: string;
  nodes: readonly T[];
  relations: readonly DiagramRelation[];
  renderNode: (node: T, context: DiagramNodeContext) => ReactNode;
  selectedId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
  /** Positions enregistrées (coin haut gauche) : elles priment sur le placement automatique. */
  positions?: Readonly<Record<string, DiagramPoint>> | undefined;
  /** Dépôt d'un déplacement (glisser ou Alt + flèches). Absent : lecteur sans déplacement (designer). */
  onMove?: ((id: string, point: DiagramPoint) => void) | undefined;
  initialZoom?: number | "fit" | undefined;
  /** Plein écran (B479) : état et bascule tenus par l'écran, qui choisit ce qui passe en plein écran (lecteur, fil, fiche). */
  fullscreen?: { active: boolean; onToggle: () => void } | undefined;
  /** Mini-carte en bas à gauche (DESIGN.md §5.3, schéma 1.3), masquée sous 768 px. */
  minimap?: boolean | undefined;
  onZoomChange?: ((zoom: number) => void) | undefined;
  className?: string | undefined;
}

const ARROW_STEP = 20;
const ARROW_DELTA: Record<string, DiagramPoint> = {
  ArrowLeft: { x: -ARROW_STEP, y: 0 },
  ArrowRight: { x: ARROW_STEP, y: 0 },
  ArrowUp: { x: 0, y: -ARROW_STEP },
  ArrowDown: { x: 0, y: ARROW_STEP },
};
const COMPACT_BELOW = 0.6;

/** Plan du diagramme : placement dagre (une fois), positions enregistrées et déplacements en cours par-dessus. */
function usePlan<T extends DiagramNode>(
  nodes: readonly T[],
  relations: readonly DiagramRelation[],
  positions: DiagramViewerProps<T>["positions"],
  moved: Readonly<Record<string, DiagramPoint>>,
) {
  const auto = useMemo(
    () => layoutDiagram({ nodes, edges: relations.map(({ from, to }) => ({ from, to })) }),
    [nodes, relations],
  );
  return useMemo(
    () => overlayPositions(auto.positions, nodes, { ...positions, ...moved }),
    [auto, nodes, positions, moved],
  );
}

function centersOf(nodes: readonly DiagramNode[], plan: DiagramLayout) {
  const result: Record<string, DiagramPoint> = {};
  for (const node of nodes) {
    const at = plan.positions[node.id];
    if (at) result[node.id] = { x: at.x + node.width / 2, y: at.y + node.height / 2 };
  }
  return result;
}

/** État du lecteur : plan, zoom, glisser, déplacement au clavier et annonce. */
function useDiagramModel<T extends DiagramNode>(props: DiagramViewerProps<T>) {
  const { nodes, relations, positions, onMove, initialZoom = 1, onZoomChange } = props;
  const isMobile = useIsMobile();
  const [moved, setMoved] = useState<Record<string, DiagramPoint>>({});
  const [announce, setAnnounce] = useState<{ text: string; zoom: number } | null>(null);
  const plan = usePlan(nodes, relations, positions, moved);
  const zoom = useDiagramZoom({ initialZoom, plan, onZoomChange });

  const commit = useCallback(
    (id: string, point: DiagramPoint) => {
      const name = nodes.find((node) => node.id === id)?.name ?? id;
      setMoved((prev) => ({ ...prev, [id]: point }));
      setAnnounce({ text: `${name} déplacée`, zoom: zoom.zoomRef.current });
      onMove?.(id, point);
    },
    [nodes, onMove, zoom.zoomRef],
  );
  const drag = useDiagramDrag({
    enabled: Boolean(onMove) && !isMobile,
    zoomRef: zoom.zoomRef,
    positionOf: (id) => plan.positions[id],
    onPreview: (id, point) => setMoved((prev) => ({ ...prev, [id]: point })),
    onCommit: commit,
  });
  /** Alt + flèche : vrai si la touche a déplacé la table (le navigateur ne doit alors pas reculer dans l'historique). */
  const nudge = (id: string, key: string) => {
    const delta = ARROW_DELTA[key];
    const at = plan.positions[id];
    if (!onMove || !delta || !at) return false;
    commit(id, clampPoint({ x: at.x + delta.x, y: at.y + delta.y }));
    return true;
  };
  const status =
    announce && announce.zoom === zoom.zoom ? announce.text : `Zoom ${zoomPercent(zoom.zoom)} %`;
  return {
    plan,
    centers: centersOf(nodes, plan),
    zoom,
    drag,
    nudge,
    status,
    draggable: Boolean(onMove) && !isMobile,
  };
}

type Model = ReturnType<typeof useDiagramModel>;

interface SlotProps<T extends DiagramNode> {
  node: T;
  model: Model;
  selected: boolean;
  renderNode: DiagramViewerProps<T>["renderNode"];
  onSelect: (() => void) | undefined;
}

/** Enveloppe de position d'un nœud : glisser, Alt + flèches ; le `button` est celui de `renderNode`. */
function NodeSlot<T extends DiagramNode>({
  node,
  model,
  selected,
  renderNode,
  onSelect,
}: SlotProps<T>) {
  const at = model.plan.positions[node.id];
  if (!at) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: enveloppe de position ; la carte porte le button
    <div
      data-slot="diagram-node"
      style={{ left: at.x, top: at.y, width: node.width }}
      className={cn("absolute", selected && "z-10", model.draggable && "cursor-grab touch-none")}
      onPointerDown={(event: PointerEvent) => model.drag.start(node.id, event)}
      onClickCapture={(event) => {
        if (model.drag.consumeClick()) event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.altKey && model.nudge(node.id, event.key)) event.preventDefault();
      }}
    >
      {renderNode(node, {
        selected,
        compact: model.zoom.zoom < COMPACT_BELOW,
        onSelect: () => onSelect?.(),
      })}
    </div>
  );
}

/** Mini-carte du plan : un rectangle par nœud, la sélection en `--primary`, le cadre visible cliquable. */
function ViewerMinimap<T extends DiagramNode>({
  nodes,
  model,
  selectedId,
}: {
  nodes: readonly T[];
  model: Model;
  selectedId: string | null | undefined;
}) {
  const { plan, zoom } = model;
  const viewport = useDiagramViewport(zoom.scrollRef, zoom.zoom, plan);
  const boxes = nodes.flatMap((node) => {
    const at = plan.positions[node.id];
    return at
      ? [
          {
            id: node.id,
            ...at,
            width: node.width,
            height: node.height,
            active: node.id === selectedId,
          },
        ]
      : [];
  });
  return (
    <DiagramMinimap
      className="max-md:hidden"
      world={{ width: plan.width, height: plan.height }}
      nodes={boxes}
      viewport={viewport.rect}
      onNavigate={viewport.center}
    />
  );
}

/**
 * Lecteur de diagramme SVG (DESIGN.md §5.19, ADR 0022) : trame de points, placement dagre, relations étiquetées,
 * zoom 50 à 200 %, sélection, glisser (équipe) et son alternative clavier Alt + flèches (WCAG 2.5.7). Les nœuds sont
 * rendus dans l'ordre des identifiants : c'est l'ordre de Tab, pas l'ordre visuel.
 */
export function DiagramViewer<T extends DiagramNode>(props: DiagramViewerProps<T>) {
  const { label, nodes, relations, renderNode, selectedId, onSelect, className } = props;
  const model = useDiagramModel(props);
  const { plan, zoom } = model;
  const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id, "en"));
  return (
    <div
      data-slot="diagram-viewer"
      className={cn(
        "relative h-[560px] overflow-hidden rounded-xl border border-border bg-surface bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[length:20px_20px]",
        className,
      )}
    >
      <div
        ref={zoom.scrollRef}
        // Région qui défile : atteignable au clavier (WCAG 2.1.1) et nommée, comme le cadre de `Table`.
        {...{ role: "region", "aria-label": label, tabIndex: 0, onKeyDown: zoom.onKeyDown }}
        className="absolute inset-0 flex overflow-auto pb-14 max-md:pb-[72px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div
          className="relative m-auto shrink-0"
          style={{
            width: Math.round(plan.width * zoom.zoom),
            height: Math.round(plan.height * zoom.zoom),
          }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ width: plan.width, height: plan.height, transform: `scale(${zoom.zoom})` }}
          >
            <DiagramRelations
              relations={relations}
              centers={model.centers}
              selectedId={selectedId}
              width={plan.width}
              height={plan.height}
            />
            {ordered.map((node) => (
              <NodeSlot
                key={node.id}
                node={node}
                model={model}
                selected={selectedId === node.id}
                renderNode={renderNode}
                onSelect={onSelect && (() => onSelect(node.id))}
              />
            ))}
          </div>
        </div>
      </div>
      {props.minimap ? <ViewerMinimap nodes={nodes} model={model} selectedId={selectedId} /> : null}
      <span role="status" className="sr-only">
        {model.status}
      </span>
      <DiagramZoomBar
        zoom={zoom.zoom}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        onReset={zoom.reset}
        onFit={zoom.fit}
        fullscreen={props.fullscreen}
      />
    </div>
  );
}
