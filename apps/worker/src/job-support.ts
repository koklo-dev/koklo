/** Briques communes aux jobs pg-boss (`spec-write`, `webhook-delivery`). */

/** Essais de la file : `retryLimit` reprises après le premier essai, `retryDelaySeconds` d'attente. */
export interface QueueSettings {
  retryLimit: number;
  retryDelaySeconds: number;
  /** Consommateurs locaux : des clés différentes progressent en parallèle. */
  concurrency: number;
}

/** Défauts communs des files `key_strict_fifo` du worker. */
export const QUEUE_DEFAULTS: QueueSettings = {
  retryLimit: 4,
  retryDelaySeconds: 5,
  concurrency: 4,
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant (UUID) porté par la clé `key` de la charge d'un job, `undefined` si absent ou mal formé. */
export function uuidFieldOf(data: unknown, key: string): string | undefined {
  const value = isRecord(data) && Object.hasOwn(data, key) ? data[key] : undefined;
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}

/** Nom de la classe de l'erreur, jamais son message (qui peut citer une réponse du fournisseur). */
export const errorNameOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : "erreur";

/**
 * Panne à relancer. pg-boss et le journal sérialisent l'erreur levée avec toutes ses propriétés :
 * on ne lève jamais l'erreur du fournisseur (corps de réponse, jetons), seulement son code.
 */
export class TransientJobError<Code extends string> extends Error {
  readonly code: Code;
  constructor(queue: string, code: Code) {
    super(`${queue}: panne transitoire (${code})`);
    this.code = code;
    this.name = "TransientJobError";
  }
}
