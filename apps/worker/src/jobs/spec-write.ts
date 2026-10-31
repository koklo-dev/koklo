import type { GitProvider, SpecBatchErrorCode } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import {
  errorNameOf,
  QUEUE_DEFAULTS,
  type QueueSettings,
  TransientJobError,
  uuidFieldOf,
} from "../job-support.ts";
import { classify } from "../spec-write/errors.ts";
import { executeBatch } from "../spec-write/execute.ts";
import { integrityProblem } from "../spec-write/paths.ts";
import type { SpecWriteStore } from "../spec-write/store.ts";
import { failed, type LoadedBatch, type Outcome } from "../spec-write/types.ts";

export { SPEC_WRITE_QUEUE, specWriteSingletonKey } from "@koklo/domain";

/** Essais et concurrence de la file : des branches différentes progressent en parallèle. */
export type SpecWriteSettings = QueueSettings;

export const SPEC_WRITE_DEFAULTS: SpecWriteSettings = QUEUE_DEFAULTS;

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

class SpecWriteTransientError extends TransientJobError<SpecBatchErrorCode> {
  constructor(code: SpecBatchErrorCode) {
    super("spec-write", code);
    this.name = "SpecWriteTransientError";
  }
}

const TERMINAL = new Set(["committed", "failed", "conflict"]);

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
    const { store } = deps;
    return await executeBatch(deps.provider, batch, await store.author(batch), () =>
      store.markCommitting(batch),
    );
  } catch (error) {
    const failure = classify(error);
    if ("outcome" in failure) return failure.outcome;
    deps.logger.warn(
      { batchId: batch.id, code: failure.retry, lastAttempt, errorName: errorNameOf(error) },
      "spec-write: panne transitoire",
    );
    if (!lastAttempt) throw new SpecWriteTransientError(failure.retry);
    return failed(failure.retry);
  }
}

const codeOf = (outcome: Outcome): SpecBatchErrorCode | null =>
  outcome.status === "committed" ? null : outcome.errorCode;

/**
 * Handler du job `{ batchId }`. Tout résultat métier (conflit, spec invalide, interdit, panne
 * finale) est écrit sur le lot et le job TERMINE normalement : un job en échec bloquerait sa clé
 * `repoId:branche` (`key_strict_fifo`). Seule une panne transitoire, avant le dernier essai, relance.
 */
export function createSpecWriteHandler(deps: SpecWriteDeps) {
  return async (job: SpecWriteJob): Promise<void> => {
    const batchId = uuidFieldOf(job.data, "batchId");
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
