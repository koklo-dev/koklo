/** Horloge de test : les instants sont toujours fournis par le test, jamais lus du système. */
export const T0 = "2026-01-01T10:00:00.000Z";
const MIN = 60_000;

/** Instant ISO = T0 + minutes + secondes (arithmétique pure sur des littéraux). */
export const at = (minutes: number, seconds = 0): string =>
  new Date(Date.parse(T0) + minutes * MIN + seconds * 1000).toISOString();

export const runner = (id: string) => ({ kind: "runner", id }) as const;
export const member = (id: string) => ({ kind: "member", id }) as const;

/** Exige une erreur de la classe donnée ; échoue si la classe n'existe pas (jamais de toThrow(undefined)). */
export const throwsA = (fn: () => unknown, errorClass: unknown): void => {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  if (typeof errorClass !== "function") throw new Error("classe d'erreur non exportée");
  if (!(thrown instanceof errorClass)) {
    throw new Error(`erreur attendue ${errorClass.name}, reçu ${String(thrown)}`);
  }
};
