"use client";

import { useCallback, useRef } from "react";

const afterPaint = (release: () => void) =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(() => requestAnimationFrame(release))
    : setTimeout(release, 32);

/**
 * Une demande à la fois : tant que la précédente n'est pas terminée, les suivantes sont ignorées. Une liste
 * qui se charge au défilement reçoit plusieurs événements avant que l'état « en cours » ne soit affiché ;
 * sans cette garde, chacun annulerait la requête de l'autre. La garde ne se lève qu'après deux images :
 * la page reçue doit être affichée et mesurée, sinon un événement de défilement tiré entre la réponse et
 * l'affichage (liste encore courte, position proche de la fin) demanderait une page de trop.
 */
export function useSingleFlight(run: () => Promise<unknown>): () => void {
  const busy = useRef(false);
  return useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    void run().finally(() =>
      afterPaint(() => {
        busy.current = false;
      }),
    );
  }, [run]);
}
