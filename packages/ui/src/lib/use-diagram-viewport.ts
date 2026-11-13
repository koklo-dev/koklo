"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";
import type { DiagramPoint } from "./diagram-layout.ts";

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Partie visible du plan, en unités du plan : défilement et taille du cadre ramenés au zoom, bornés au plan. */
export function visibleRect(
  frame: { scrollLeft: number; scrollTop: number; clientWidth: number; clientHeight: number },
  zoom: number,
  plan: { width: number; height: number },
): ViewportRect {
  const width = Math.min(plan.width, frame.clientWidth / zoom);
  const height = Math.min(plan.height, frame.clientHeight / zoom);
  const x = Math.min(Math.max(0, frame.scrollLeft / zoom), plan.width - width);
  const y = Math.min(Math.max(0, frame.scrollTop / zoom), plan.height - height);
  return { x, y, width, height };
}

/**
 * Cadre visible du lecteur pour la mini-carte (DESIGN.md §5.3, schéma 1.3) : suivi au défilement, au
 * redimensionnement et au zoom ; `center` amène un point du plan au centre du cadre.
 */
export function useDiagramViewport(
  scrollRef: RefObject<HTMLDivElement | null>,
  zoom: number,
  plan: { width: number; height: number },
) {
  const [rect, setRect] = useState<ViewportRect>({
    x: 0,
    y: 0,
    width: plan.width,
    height: plan.height,
  });
  const { width, height } = plan;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setRect(visibleRect(el, zoom, { width, height }));
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [scrollRef, zoom, width, height]);
  const center = useCallback(
    (point: DiagramPoint) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft = point.x * zoom - el.clientWidth / 2;
      el.scrollTop = point.y * zoom - el.clientHeight / 2;
    },
    [scrollRef, zoom],
  );
  return { rect, center };
}
