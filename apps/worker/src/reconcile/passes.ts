import {
  installationDeliveryKey,
  pushDeliveryKey,
  RECONCILE_MAX_REQUEUES_DEFAULT,
  SPEC_WRITE_QUEUE,
  specWriteSingletonKey,
  WEBHOOK_DELIVERY_QUEUE,
} from "@koklo/domain";
import type { PgBoss } from "pg-boss";
import { parseDeliveryPayload } from "../webhook/payload.ts";
import { type Orphan, requeueOrphan } from "./requeue.ts";
import type { ReconcileStore } from "./store.ts";
import type { PassCount } from "./types.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface PassDeps {
  readonly boss: PgBoss;
  readonly store: ReconcileStore;
  readonly graceMinutes: number;
  readonly retentionDays: number;
  readonly now: () => Date;
  readonly maxRequeues?: number;
}

/** Ré-enfile chaque orphelin (ou `null` si la ligne est inexploitable) ; compte le résultat. */
async function requeueAll(
  boss: PgBoss,
  orphans: readonly (Orphan | null)[],
  onRequeued: (index: number) => Promise<void> = async () => {},
): Promise<PassCount> {
  const count: PassCount = { requeued: 0, skipped: 0 };
  for (const [index, orphan] of orphans.entries()) {
    const result = orphan ? await requeueOrphan(boss, orphan) : "skipped";
    if (result === "requeued") await onRequeued(index);
    count[result]++;
  }
  return count;
}

/**
 * P1 : livraisons `received`/`processing` plus vieilles que la grâce sans job vivant. Celles de
 * plus de `rétention - 1` jour sont ignorées : la purge les supprimera avant qu'elles servent.
 */
export function deliveriesPass(deps: PassDeps): () => Promise<PassCount> {
  return async () => {
    const now = deps.now().getTime();
    const rows = await deps.store.unsettledDeliveries(
      new Date(now - deps.graceMinutes * MINUTE_MS),
      new Date(now - (deps.retentionDays - 1) * DAY_MS),
      deps.maxRequeues ?? RECONCILE_MAX_REQUEUES_DEFAULT,
    );
    return requeueAll(
      deps.boss,
      rows.map((row) => {
        const job = parseDeliveryPayload(row.event, row.payload);
        if (job === undefined) return null;
        const singletonKey =
          job.kind === "push"
            ? pushDeliveryKey(job.repositoryId, job.ref)
            : installationDeliveryKey(job.installationId);
        return {
          queue: WEBHOOK_DELIVERY_QUEUE,
          field: "deliveryId",
          rowId: row.id,
          singletonKey,
        } as const;
      }),
    );
  };
}

/** P2 : lots `queued`/`committing` plus vieux que la grâce sans job vivant ; un audit système par lot relancé. */
export function batchesPass(deps: PassDeps): () => Promise<PassCount> {
  return async () => {
    const rows = await deps.store.openBatches(
      new Date(deps.now().getTime() - deps.graceMinutes * MINUTE_MS),
      deps.maxRequeues ?? RECONCILE_MAX_REQUEUES_DEFAULT,
    );
    return requeueAll(
      deps.boss,
      rows.map((row) => ({
        queue: SPEC_WRITE_QUEUE,
        field: "batchId",
        rowId: row.id,
        singletonKey: specWriteSingletonKey(row.repoId, row.branch),
      })),
      async (index) => {
        const row = rows[index];
        if (row) await deps.store.recordBatchRequeued(row);
      },
    );
  };
}
