import type { GitProvider, SpecBatchErrorCode } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import { classify } from "../spec-write/errors.ts";
import { executeBatch } from "../spec-write/execute.ts";
import { integrityProblem } from "../spec-write/paths.ts";
import type { SpecWriteStore } from "../spec-write/store.ts";
import { failed, type LoadedBatch, type Outcome } from "../spec-write/types.ts";

export { SPEC_WRITE_QUEUE, specWriteSingletonKey } from "@koklo/domain";

/** Essais de la file : `retryLimit` reprises après le premier essai, `retryDelaySeconds` d'attente. */
export interface SpecWriteSettings {
  retryLimit: number;
  retryDelaySeconds: number;
  /** Consommateurs locaux : des branches différentes progressent en parallèle. */
  concurrency: number;
}

export const SPEC_WRITE_DEFAULTS: SpecWriteSettings = {
  retryLimit: 4,
  retryDelaySeconds: 5,
  concurrency: 4,
};

/** Job reçu de pg-boss : `retryCount` compte les reprises déjà faites. */
export interface SpecWriteJob {
  id: string;
  data: unknown;
  retryCount: number;
}

export interface SpecWriteDeps {
  store: SpecWriteStore;
  /** `null` : ni App configurée ni fournisseur injecté ; les lots échouent en `PROVIDER_UNAVAILABLE`. */
  provider: GitProvider | null;
  logger: Logger;
  retryLimit: number;
}

/**
 * Panne à relancer. pg-boss et le journal sérialisent l'erreur levée avec toutes ses propriétés :
 * on ne lève jamais l'erreur du fournisseur (corps de réponse, jetons), seulement son code.
 */
class SpecWriteTransientError extends Error {
  constructor(readonly code: SpecBatchErrorCode) {
    super(`spec-write: panne transitoire (${code})`);
    this.name = "SpecWriteTransientError";
  }
}

const TERMINAL = new Set(["committed", "failed", "conflict"]);
const BATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function batchIdOf(data: unknown): string | undefined {
  const id =
    typeof data === "object" && data !== null ? (data as { batchId?: unknown }).batchId : "";
  return typeof id === "string" && BATCH_ID.test(id) ? id : undefined;
}

/** Une exécution : résultat métier à écrire, ou exception si la panne est transitoire et non finale. */
async function attemptBatch(
  deps: SpecWriteDeps,
  batch: LoadedBatch,
  lastAttempt: boolean,
): Promise<Outcome> {
  const problem = integrityProblem(batch);
  if (problem !== undefined) {
    deps.logger.error(
      { batchId: batch.id, field: problem },
      "spec-write: données du lot invalides",
    );
    return failed("INTERNAL");
  }
  if (deps.provider === null) return failed("PROVIDER_UNAVAILABLE");
  try {
    await deps.store.markCommitting(batch);
    return await executeBatch(deps.provider, batch, await deps.store.author(batch));
  } catch (error) {
    const failure = classify(error);
    if ("outcome" in failure) return failure.outcome;
    deps.logger.warn(
      { batchId: batch.id, code: failure.retry, lastAttempt, errorName: nameOf(error) },
      "spec-write: panne transitoire",
    );
    if (!lastAttempt) throw new SpecWriteTransientError(failure.retry);
    return failed(failure.retry);
  }
}

const nameOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : "erreur";

const codeOf = (outcome: Outcome): SpecBatchErrorCode | null =>
  outcome.status === "committed" ? null : outcome.errorCode;

/**
 * Handler du job `{ batchId }`. Tout résultat métier (conflit, spec invalide, interdit, panne
 * finale) est écrit sur le lot et le job TERMINE normalement : un job en échec bloquerait sa clé
 * `repoId:branche` (`key_strict_fifo`). Seule une panne transitoire, avant le dernier essai, relance.
 */
export function createSpecWriteHandler(deps: SpecWriteDeps) {
  return async (job: SpecWriteJob): Promise<void> => {
    const batchId = batchIdOf(job.data);
    if (batchId === undefined) {
      deps.logger.warn({ jobId: job.id }, "spec-write: payload invalide, job ignoré");
      return;
    }
    const batch = await deps.store.load(batchId);
    if (!batch || TERMINAL.has(batch.status)) return;
    const outcome = await attemptBatch(deps, batch, job.retryCount >= deps.retryLimit);
    await deps.store.settle(batch, outcome);
    deps.logger.info(
      { batchId, status: outcome.status, errorCode: codeOf(outcome) },
      "spec-write: lot réglé",
    );
  };
}
