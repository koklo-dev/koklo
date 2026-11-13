"use client";

import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { anchorScroll, fitZoom, nextZoom, previousZoom, type Size } from "./diagram-zoom.ts";

export interface DiagramZoomOptions {
  /** Niveau d'ouverture : un palier, ou `"fit"` pour s'ouvrir en « Ajuster ». */
  initialZoom: number | "fit";
  /** Taille du plan (marge comprise), pour « Ajuster ». */
  plan: Size;
  /** Appelé à chaque changement voulu par l'utilisateur (pas à l'ouverture en « Ajuster »). */
  onZoomChange?: ((zoom: number) => void) | undefined;
}

type Pointer = { x: number; y: number };
type Apply = (next: number, pointer?: Pointer) => void;

/** Taille utile pour « Ajuster » : le cadre moins son retrait bas, réservé à la barre de zoom flottante. */
const measure = (el: HTMLElement | null): Size => ({
  width: el?.clientWidth ?? 0,
  height: el ? el.clientHeight - (Number.parseFloat(getComputedStyle(el).paddingBottom) || 0) : 0,
});

/** `Ctrl/⌘ + molette`, ancré sous le pointeur (B428) : écouteur natif non passif, sinon la page zoomerait. */
function useWheelZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  zoomRef: RefObject<number>,
  apply: Apply,
) {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const next = event.deltaY < 0 ? nextZoom(zoomRef.current) : previousZoom(zoomRef.current);
      apply(next, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollRef, zoomRef, apply]);
}

/** `Ctrl/⌘ + « + »`, `« − »`, `« 0 »` quand le lecteur a le focus. */
function useZoomKeys(zoomRef: RefObject<number>, apply: Apply) {
  return useCallback(
    (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key;
      if (key === "+" || key === "=") apply(nextZoom(zoomRef.current));
      else if (key === "-") apply(previousZoom(zoomRef.current));
      else if (key === "0") apply(1);
      else return;
      event.preventDefault();
    },
    [zoomRef, apply],
  );
}

/** Zoom du lecteur : paliers, « Ajuster », `Ctrl/⌘ + − 0` et `Ctrl/⌘ + molette`. */
export function useDiagramZoom({ initialZoom, plan, onZoomChange }: DiagramZoomOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(typeof initialZoom === "number" ? initialZoom : 1);
  const zoomRef = useRef(zoom);
  const planRef = useRef(plan);
  const changeRef = useRef(onZoomChange);
  const openingRef = useRef(initialZoom);
  const pending = useRef<{ left: number; top: number } | null>(null);
  zoomRef.current = zoom;
  planRef.current = plan;
  changeRef.current = onZoomChange;

  const apply = useCallback<Apply>((next, pointer) => {
    const from = zoomRef.current;
    const el = scrollRef.current;
    if (next === from) return;
    if (pointer && el) {
      const scroll = { left: el.scrollLeft, top: el.scrollTop };
      pending.current = anchorScroll({ from, to: next, pointer, scroll });
    }
    zoomRef.current = next;
    setZoom(next);
    changeRef.current?.(next);
  }, []);

  // Ouverture seulement : un nouveau plan ne ré-ajuste pas ce que la personne a réglé.
  useLayoutEffect(() => {
    if (openingRef.current === "fit") setZoom(fitZoom(measure(scrollRef.current), planRef.current));
  }, []);
  // Après chaque rendu : applique l'ancrage de la molette une fois la nouvelle taille posée.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!pending.current || !el) return;
    el.scrollLeft = pending.current.left;
    el.scrollTop = pending.current.top;
    pending.current = null;
  });
  useWheelZoom(scrollRef, zoomRef, apply);

  const onKeyDown = useZoomKeys(zoomRef, apply);

  return {
    zoom,
    zoomRef,
    scrollRef,
    onKeyDown,
    zoomIn: () => apply(nextZoom(zoomRef.current)),
    zoomOut: () => apply(previousZoom(zoomRef.current)),
    reset: () => apply(1),
    fit: () => apply(fitZoom(measure(scrollRef.current), planRef.current)),
  };
}
