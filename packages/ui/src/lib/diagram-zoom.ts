/** Paliers de zoom du lecteur de diagramme (B425, maquette 11 l.455). */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2] as const;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
const EPSILON = 0.001;

/** Palier au-dessus du niveau donné (un niveau « Ajuster » hors palier monte au plus proche), 200 % au plus. */
export function nextZoom(zoom: number): number {
  return ZOOM_STEPS.find((step) => step > zoom + EPSILON) ?? ZOOM_MAX;
}

/** Palier en dessous du niveau donné, 50 % au plus bas. */
export function previousZoom(zoom: number): number {
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - EPSILON) ?? ZOOM_MIN;
}

export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}

export interface Size {
  width: number;
  height: number;
}

/**
 * « Ajuster » : min(largeur utile / largeur du plan, hauteur utile / hauteur du plan), arrondi à 2 décimales, borné
 * à 0,5 et 2 (maquette 11 l.456). Sans mesure (fenêtre pas encore dessinée), 100 %.
 */
export function fitZoom(view: Size, plan: Size): number {
  if (view.width <= 0 || view.height <= 0 || plan.width <= 0 || plan.height <= 0) return 1;
  const ratio = Math.min(view.width / plan.width, view.height / plan.height);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(ratio * 100) / 100));
}

export interface AnchorInput {
  from: number;
  to: number;
  /** Position du pointeur dans la fenêtre de défilement. */
  pointer: { x: number; y: number };
  scroll: { left: number; top: number };
}

/** Défilement qui garde sous le pointeur le point du plan qui s'y trouvait avant le changement de zoom. */
export function anchorScroll({ from, to, pointer, scroll }: AnchorInput) {
  const ratio = to / from;
  return {
    left: Math.max(0, Math.round((scroll.left + pointer.x) * ratio - pointer.x)),
    top: Math.max(0, Math.round((scroll.top + pointer.y) * ratio - pointer.y)),
  };
}
