/** Bornes et rythme du suivi d'un enregistrement (S-feature-form §4.4, §4.5). */
export const FIRST_POLL_MS = 1500;
export const POLL_FACTOR = 1.5;
export const POLL_MAX_MS = 5000;
export const TRACKING_LIMIT_MS = 60_000;
export const INDEX_POLL_MS = 2000;
export const INDEX_LIMIT_MS = 30_000;

/** Délai avant la relecture n° `attempt` (0 = la première) : 1,5 s, ×1,5, plafonné à 5 s. */
export function pollDelay(attempt: number): number {
  return Math.min(FIRST_POLL_MS * POLL_FACTOR ** attempt, POLL_MAX_MS);
}
