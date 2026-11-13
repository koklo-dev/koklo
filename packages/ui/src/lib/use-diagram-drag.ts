"use client";

import { type MutableRefObject, type PointerEvent, useCallback, useEffect, useRef } from "react";
import { clampPoint, type DiagramPoint } from "./diagram-layout.ts";

/** Sous ce déplacement (px écran), l'appui reste un clic de sélection. */
const DRAG_THRESHOLD = 4;

export interface DiagramDragOptions {
  /** Faux sous 768 px et sans `onMove` : l'appui ne fait alors que sélectionner. */
  enabled: boolean;
  zoomRef: MutableRefObject<number>;
  positionOf: (id: string) => DiagramPoint | undefined;
  /** Position provisoire pendant le glisser. */
  onPreview: (id: string, point: DiagramPoint) => void;
  /** Dépôt : appelé une fois, au relâchement. */
  onCommit: (id: string, point: DiagramPoint) => void;
}

interface Session {
  id: string;
  startX: number;
  startY: number;
  origin: DiagramPoint;
  last: DiagramPoint | null;
}

/**
 * Glisser d'une table (équipe seulement). Les mouvements sont écoutés sur `window` le temps du glisser, la distance
 * est divisée par le zoom. Un glisser réel supprime le clic qui le suit : la sélection ne change pas.
 */
export function useDiagramDrag({
  enabled,
  zoomRef,
  positionOf,
  onPreview,
  onCommit,
}: DiagramDragOptions) {
  const stop = useRef<(() => void) | null>(null);
  const swallowClick = useRef(false);
  useEffect(() => () => stop.current?.(), []);

  const start = useCallback(
    (id: string, event: PointerEvent) => {
      const origin = positionOf(id);
      if (!enabled || event.button !== 0 || !origin) return;
      const session: Session = {
        id,
        startX: event.clientX,
        startY: event.clientY,
        origin,
        last: null,
      };
      const move = (e: globalThis.PointerEvent | MouseEvent) => {
        const dx = e.clientX - session.startX;
        const dy = e.clientY - session.startY;
        if (!session.last && !(Math.hypot(dx, dy) >= DRAG_THRESHOLD)) return;
        const zoom = zoomRef.current;
        session.last = clampPoint({ x: origin.x + dx / zoom, y: origin.y + dy / zoom });
        onPreview(id, session.last);
      };
      const end = () => {
        stop.current?.();
        if (!session.last) return;
        swallowClick.current = true;
        setTimeout(() => {
          swallowClick.current = false;
        }, 0);
        onCommit(id, session.last);
      };
      stop.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        stop.current = null;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [enabled, zoomRef, positionOf, onPreview, onCommit],
  );

  /** Vrai une fois (le clic qui suit un glisser) : le lecteur l'ignore. */
  const consumeClick = useCallback(() => swallowClick.current, []);
  return { start, consumeClick };
}
