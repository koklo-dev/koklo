"use client";

import { useSyncExternalStore } from "react";

/** Largeur de la fenêtre au plus égale à `px` (`max-width`) : faux côté serveur, donc le bureau avant mesure. */
export function useMaxWidth(px: number): boolean {
  const query = `(max-width: ${px}px)`;
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Sous 1024 px : l'onglet Tables est celui par défaut de l'écran Données (B425). */
export const NARROW_MAX = 1023;
/** Sous 1280 px : la fiche du diagramme passe en panneau superposé (B426). */
export const OVERLAY_MAX = 1279;
