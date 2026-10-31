/** Attente maximale par défaut de `specBatch.submit` avant de rendre le lot en cours. */
export const SPEC_BATCH_WAIT_DEFAULT_MS = 8000;
/** Intervalle entre deux lectures de la base pendant l'attente (aucune transaction ouverte). */
export const SPEC_BATCH_POLL_MS = 150;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Relit `read` toutes les 150 ms jusqu'à ce que `isDone` soit vrai ou que `waitMs` soit écoulé ;
 * rend la dernière valeur lue. L'horloge est celle du système (pas l'horloge injectée de l'API,
 * figée en test) et `read` est une lecture simple : rien n'est tenu ouvert entre deux lectures.
 */
export async function pollUntil<T>(
  first: T,
  read: () => Promise<T | null>,
  isDone: (value: T) => boolean,
  waitMs: number,
): Promise<T> {
  const deadline = performance.now() + waitMs;
  let current = first;
  while (!isDone(current)) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await sleep(Math.min(SPEC_BATCH_POLL_MS, remaining));
    current = (await read()) ?? current;
  }
  return current;
}
