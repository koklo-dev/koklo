"use client";

import type { HTMLAttributes, KeyboardEvent, MouseEvent } from "react";
import { cn } from "../lib/cn.ts";

const WIDTH = 150;

export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MinimapNode extends MinimapRect {
  id: string;
  /** Zone ouverte : dessinée en `--primary`. */
  active?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface DiagramMinimapProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onChange"> {
  /** Étendue du diagramme, en unités du diagramme. */
  world: { width: number; height: number };
  nodes: readonly MinimapNode[];
  /** Zone visible dans la vue, en unités du diagramme. */
  viewport: MinimapRect;
  /** Demande de centrer la vue sur ce point (unités du diagramme). */
  onNavigate: (center: Point) => void;
}

const KEY_STEP: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

type World = DiagramMinimapProps["world"];

/** Clic : centre de la vue = point cliqué, en unités du diagramme. */
function pointAt(event: MouseEvent<HTMLButtonElement>, world: World): Point {
  const box = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * world.width,
    y: ((event.clientY - box.top) / box.height) * world.height,
  };
}

/** Flèche : centre actuel de la vue décalé d'un dixième du diagramme. */
function pointAfterKey(key: string, world: World, viewport: MinimapRect): Point | null {
  const step = KEY_STEP[key];
  if (!step) return null;
  return {
    x: viewport.x + viewport.width / 2 + step.x * (world.width / 10),
    y: viewport.y + viewport.height / 2 + step.y * (world.height / 10),
  };
}

const px = (value: number, scale: number) => value * scale;

/**
 * Mini-carte d'un diagramme (DESIGN.md v2.1 §5.3, schéma 1.3) : 150 px, cadre de la vue en `--primary`,
 * cliquable pour se déplacer ; les flèches déplacent la vue d'un dixième du diagramme.
 */
export function DiagramMinimap({
  world,
  nodes,
  viewport,
  onNavigate,
  className,
  ...props
}: DiagramMinimapProps) {
  const scale = WIDTH / world.width;
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) return; // activation au clavier : les flèches font le travail
    onNavigate(pointAt(event, world));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const point = pointAfterKey(event.key, world, viewport);
    if (!point) return;
    event.preventDefault();
    onNavigate(point);
  };
  const place = (rect: MinimapRect) => ({
    left: px(rect.x, scale),
    top: px(rect.y, scale),
    width: px(rect.width, scale),
    height: px(rect.height, scale),
  });
  return (
    <div
      data-slot="diagram-minimap"
      className={cn("absolute bottom-3 left-3", className)}
      {...props}
    >
      <button
        type="button"
        aria-label="Mini-carte du diagramme : cliquer ou utiliser les flèches pour déplacer la vue"
        style={{ width: WIDTH, height: Math.round(world.height * scale) }}
        className="relative block overflow-hidden rounded-md border bg-background shadow-floating focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {nodes.map((node) => (
          <span
            key={node.id}
            data-minimap-node
            aria-hidden="true"
            style={place(node)}
            className={cn(
              "absolute rounded-[3px]",
              node.active ? "bg-primary" : "bg-border-strong",
            )}
          />
        ))}
        <span
          data-minimap-viewport
          aria-hidden="true"
          style={place(viewport)}
          className="absolute rounded-[3px] border-[1.5px] border-primary"
        />
      </button>
    </div>
  );
}
