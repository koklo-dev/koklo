"use client";

import { useEffect, useRef } from "react";

/** Défilement vers la suite : le pied de liste charge la page suivante quand il entre dans l'écran. */
export function useAutoLoad(onLoadMore: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, enabled]);
  return ref;
}
