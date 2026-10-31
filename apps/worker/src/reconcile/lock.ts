import type { PrismaClient } from "@koklo/db";
import { RECONCILE_LOCK_KEY } from "@koklo/domain";

/** Durée maximale d'un tick ; au-delà, la transaction qui porte le verrou est annulée. */
const LOCK_TIMEOUT_MS = 9 * 60_000;

/**
 * Exécute `body` si aucun autre tick ne tient le verrou consultatif `RECONCILE_LOCK_KEY` (rend
 * `undefined` sinon). Le verrou est lié à une transaction : Postgres le libère à sa fin, même si le
 * process meurt, sans dépendre de la connexion du pool qui a posé le verrou.
 */
export async function withReconcileLock<T>(
  raw: PrismaClient,
  body: () => Promise<T>,
): Promise<T | undefined> {
  return raw.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${RECONCILE_LOCK_KEY}::bigint) AS locked`;
      return row?.locked ? body() : undefined;
    },
    { timeout: LOCK_TIMEOUT_MS, maxWait: 10_000 },
  );
}
