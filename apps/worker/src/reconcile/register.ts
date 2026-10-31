import type { PrismaClient } from "@koklo/db";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import {
  createReconcileHandler,
  RECONCILE_CRON,
  RECONCILE_QUEUE,
  RECONCILE_TIMEZONE,
} from "../jobs/reconcile.ts";
import { instrumentJob } from "../observability.ts";
import { batchesPass, deliveriesPass } from "./passes.ts";
import { ReconcileStore } from "./store.ts";

export interface ReconcileRegistration {
  readonly raw: PrismaClient;
  readonly graceMinutes: number;
  readonly retentionDays: number;
}

/**
 * File `reconcile` (ordinaire, sans reprise : le tick suivant répare) et sa planification unique
 * (le redémarrage ne la duplique pas). Les passes sont celles du socle 46a : P1 et P2.
 */
export async function registerReconcile(
  boss: PgBoss,
  logger: Logger,
  deps: ReconcileRegistration,
): Promise<void> {
  await boss.createQueue(RECONCILE_QUEUE, { retryLimit: 0 });
  const passDeps = {
    boss,
    store: new ReconcileStore(deps.raw),
    graceMinutes: deps.graceMinutes,
    retentionDays: deps.retentionDays,
    now: () => new Date(),
  };
  const handler = createReconcileHandler({
    raw: deps.raw,
    logger,
    passes: { deliveries: deliveriesPass(passDeps), batches: batchesPass(passDeps) },
  });
  await boss.work(RECONCILE_QUEUE, instrumentJob(logger, RECONCILE_QUEUE, handler));
  await boss.schedule(RECONCILE_QUEUE, RECONCILE_CRON, null, { tz: RECONCILE_TIMEZONE });
}
