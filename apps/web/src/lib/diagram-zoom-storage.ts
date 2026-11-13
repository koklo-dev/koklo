import { ZOOM_STEPS } from "@koklo/ui";

/** Clé du zoom du diagramme, par navigateur (B425). */
export const ZOOM_STORAGE_KEY = "koklo:data-diagram-zoom";

/** Zoom mémorisé : un palier du lecteur, sinon rien (stockage absent, bloqué ou valeur étrangère). */
export function readStoredZoom(): number | undefined {
  try {
    const stored = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY));
    return (ZOOM_STEPS as readonly number[]).includes(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** Mémorise le zoom ; le stockage est un confort, son échec ne se signale pas. */
export function writeStoredZoom(zoom: number): void {
  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    // Navigation privée ou stockage plein : le zoom ne sera simplement pas rouvert.
  }
}
