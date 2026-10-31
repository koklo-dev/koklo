import type { PrismaClient } from "@koklo/db";
import type { Logger } from "@koklo/observability";
import { errorNameOf } from "../job-support.ts";
import { withReconcileLock } from "../reconcile/lock.ts";
import {
  emptyHeadCount,
  emptyPullRequestCount,
  type PassCount,
  type PassName,
  type ReconcilePasses,
} from "../reconcile/types.ts";

export { RECONCILE_QUEUE } from "@koklo/domain";

/** Planification unique : toutes les 10 minutes, en UTC. */
export const RECONCILE_CRON = "*/10 * * * *";
export const RECONCILE_TIMEZONE = "UTC";

export interface ReconcileDeps {
  readonly raw: PrismaClient;
  readonly logger: Logger;
  readonly passes: ReconcilePasses;
}

const NONE: PassCount = { requeued: 0, skipped: 0 };

/**
 * Handler du tick : sous verrou consultatif (un seul tick à la fois, même avec plusieurs workers),
 * exécute chaque passe l'une après l'autre ; la panne d'une passe est nommée dans `failedPasses`
 * sans arrêter les suivantes. Termine toujours normalement (le tick suivant est la reprise) et
 * journalise UNE ligne de bilan faite de nombres et de noms de passes, jamais d'identifiants,
 * de charges ni de messages d'erreur.
 */
export function createReconcileHandler(deps: ReconcileDeps) {
  return async (): Promise<void> => {
    const startedAt = Date.now();
    const result = await withReconcileLock(deps.raw, async () => {
      const counts = {
        deliveries: NONE,
        batches: NONE,
        prs: emptyPullRequestCount(),
        heads: emptyHeadCount(),
      };
      const failedPasses: PassName[] = [];
      for (const name of Object.keys(deps.passes) as PassName[]) {
        try {
          Object.assign(counts, { [name]: await deps.passes[name]() });
        } catch (error) {
          failedPasses.push(name);
          deps.logger.warn(
            { pass: name, errorName: errorNameOf(error) },
            "reconcile: passe en échec",
          );
        }
      }
      return { ...counts, failedPasses };
    });
    deps.logger.info(
      result ? { ...result, durationMs: Date.now() - startedAt } : { skipped: "already_running" },
      "reconcile: bilan",
    );
  };
}
