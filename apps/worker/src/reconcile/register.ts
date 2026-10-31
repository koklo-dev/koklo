import { type PrismaClient, withTenantIsolation } from "@koklo/db";
import type { GitProvider } from "@koklo/domain";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import {
  createReconcileHandler,
  RECONCILE_CRON,
  RECONCILE_QUEUE,
  RECONCILE_TIMEZONE,
} from "../jobs/reconcile.ts";
import { instrumentJob } from "../observability.ts";
import { IndexWriter } from "../webhook/index-writer.ts";
import { TargetStore } from "../webhook/target-store.ts";
import { PrismaHeadStore } from "./head-store.ts";
import { headsPass } from "./heads.ts";
import { batchesPass, deliveriesPass } from "./passes.ts";
import { PrismaPullRequestStore } from "./pr-store.ts";
import { pullRequestsPass } from "./pull-requests.ts";
import { ReconcileStore } from "./store.ts";

export interface ReconcileRegistration {
  readonly raw: PrismaClient;
  readonly graceMinutes: number;
  readonly retentionDays: number;
  /** Budget d'appels fournisseur de P4 par run ; absent, le défaut du domaine. */
  readonly maxProviderCalls?: number;
  /** `null` : aucun fournisseur configuré, P3 et P4 ne font rien. */
  readonly provider: GitProvider | null;
}

/**
 * File `reconcile` (ordinaire, sans reprise : le tick suivant répare) et sa planification unique
 * (le redémarrage ne la duplique pas). Passes : P1 et P2 (socle 46a), P3 (PR fusionnées à la main), P4 (index des têtes de spec).
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
  const client = withTenantIsolation(deps.raw);
  const handler = createReconcileHandler({
    raw: deps.raw,
    logger,
    passes: {
      deliveries: deliveriesPass(passDeps),
      batches: batchesPass(passDeps),
      prs: pullRequestsPass({
        store: new PrismaPullRequestStore(deps.raw),
        provider: deps.provider,
        logger,
      }),
      heads: headsPass({
        store: new PrismaHeadStore(deps.raw),
        indexing: {
          targets: new TargetStore(deps.raw, client),
          writer: new IndexWriter(client),
          logger,
        },
        provider: deps.provider,
        ...(deps.maxProviderCalls === undefined ? {} : { maxProviderCalls: deps.maxProviderCalls }),
        logger,
      }),
    },
  });
  await boss.work(RECONCILE_QUEUE, instrumentJob(logger, RECONCILE_QUEUE, handler));
  await boss.schedule(RECONCILE_QUEUE, RECONCILE_CRON, null, { tz: RECONCILE_TIMEZONE });
}
