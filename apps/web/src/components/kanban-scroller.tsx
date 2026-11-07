"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

interface Edges {
  start: boolean;
  end: boolean;
}

const NONE: Edges = { start: false, end: false };
/** Marge d'arrondi des positions de défilement fractionnaires. */
const SLACK_PX = 1;

const SHADOW = "color-mix(in oklab, var(--foreground) 16%, transparent)";

/** Quels bords cachent encore des colonnes : à gauche si on a défilé, à droite s'il en reste. */
function edgesOf(scroller: HTMLElement): Edges {
  const { scrollLeft, scrollWidth, clientWidth } = scroller;
  return {
    start: scrollLeft > SLACK_PX,
    end: scrollLeft + clientWidth < scrollWidth - SLACK_PX,
  };
}

function useEdges() {
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState<Edges>(NONE);
  const update = useCallback(() => {
    if (!ref.current) return;
    const next = edgesOf(ref.current);
    setEdges((current) =>
      current.start === next.start && current.end === next.end ? current : next,
    );
  }, []);
  useEffect(() => {
    update();
    const scroller = ref.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [update]);
  return { ref, edges, update };
}

function Shadow({ side }: { side: "start" | "end" }) {
  return (
    <div
      aria-hidden="true"
      data-edge={side}
      style={{
        backgroundImage: `linear-gradient(to ${side === "end" ? "left" : "right"}, ${SHADOW}, transparent)`,
      }}
      className={`pointer-events-none absolute inset-y-0 z-10 w-6 ${side === "end" ? "right-0" : "left-0"}`}
    />
  );
}

/**
 * Région défilante des colonnes du kanban : barre de défilement visible (fine, couleur de jeton) et ombre sur
 * chaque bord qui cache encore des colonnes, pour que la coupe à droite ne passe pas pour une fin de tableau.
 */
export function KanbanScroller({ children }: { children: ReactNode }) {
  const { ref, edges, update } = useEdges();
  return (
    <div className="relative min-w-0">
      {edges.start ? <Shadow side="start" /> : null}
      {edges.end ? <Shadow side="end" /> : null}
      <section
        ref={ref}
        aria-label="Colonnes du kanban"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilante atteignable au clavier (axe scrollable-region-focusable)
        tabIndex={0}
        onScroll={update}
        className="flex snap-x snap-proximity gap-4 overflow-x-auto pb-2 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:snap-none"
      >
        {children}
      </section>
    </div>
  );
}
