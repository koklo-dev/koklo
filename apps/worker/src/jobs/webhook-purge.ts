import type { Logger } from "@koklo/observability";
import type { DeliveryStore } from "../webhook/delivery-store.ts";

export { WEBHOOK_PURGE_QUEUE } from "@koklo/domain";

/** Planification unique de la purge : tous les jours à 03:17 UTC. */
export const WEBHOOK_PURGE_CRON = "17 3 * * *";
export const WEBHOOK_PURGE_TIMEZONE = "UTC";

const DAY_MS = 86_400_000;

export interface WebhookPurgeDeps {
  readonly deliveries: DeliveryStore;
  readonly logger: Logger;
  readonly retentionDays: number;
  readonly now?: () => Date;
}

/**
 * Handler de la purge : supprime par lots les livraisons reçues avant `now - rétention`, tous
 * statuts confondus, jusqu'à épuisement. Idempotent. Journalise des nombres, jamais une charge.
 */
export function createWebhookPurgeHandler(deps: WebhookPurgeDeps) {
  return async (): Promise<void> => {
    const now = (deps.now ?? (() => new Date()))();
    const cutoff = new Date(now.getTime() - deps.retentionDays * DAY_MS);
    let deleted = 0;
    for (let batch = await deps.deliveries.purgeBefore(cutoff); batch > 0; ) {
      deleted += batch;
      batch = await deps.deliveries.purgeBefore(cutoff);
    }
    deps.logger.info(
      { deleted, retentionDays: deps.retentionDays },
      "webhook-purge: livraisons expirées supprimées",
    );
  };
}
