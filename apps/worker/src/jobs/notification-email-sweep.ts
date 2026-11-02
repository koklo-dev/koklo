import type { Logger } from "@koklo/observability";
import { errorNameOf } from "../job-support.ts";
import type { NotificationEmailStore } from "../notification/store.ts";
import { SWEEP_BATCH_SIZE, SWEEP_WINDOW_HOURS } from "../notification/types.ts";
import { SEND_NOTIFICATION_EMAIL_QUEUE } from "./send-notification-email.ts";

export const NOTIFICATION_EMAIL_SWEEP_QUEUE = "notification-email-sweep";

/** Planification unique du balayage : toutes les minutes, en UTC. */
export const NOTIFICATION_EMAIL_SWEEP_CRON = "* * * * *";
export const NOTIFICATION_EMAIL_SWEEP_TIMEZONE = "UTC";

/** Part de `PgBoss` utilisée par le balayage : enfiler un job avec une clé d'unicité. */
export interface NotificationJobQueue {
  send(
    name: string,
    data: object,
    options: { singletonKey: string },
  ): Promise<string | null | undefined>;
}

export interface NotificationSweepDeps {
  readonly store: Pick<NotificationEmailStore, "withPendingBatch" | "skipUnemailedTypes">;
  readonly queue: NotificationJobQueue;
  readonly logger: Logger;
  readonly now?: () => Date;
}

/**
 * Handler du balayage (TK-58c) : règle d'abord les types non e-mailés, puis, sous verrou de lot, enfile un `send-notification-email`
 * `{ notificationId }` (singletonKey = id) par notification `pending` de la fenêtre. Ne lève jamais.
 */
export function createNotificationSweepHandler(deps: NotificationSweepDeps) {
  const { store, queue, logger } = deps;
  const now = deps.now ?? (() => new Date());

  const enqueueAll = async (ids: readonly string[]) => {
    let failed = 0;
    for (const id of ids) {
      try {
        await queue.send(
          SEND_NOTIFICATION_EMAIL_QUEUE,
          { notificationId: id },
          { singletonKey: id },
        );
      } catch {
        failed += 1;
      }
    }
    return { selected: ids.length, enqueued: ids.length - failed, failed };
  };

  return async (): Promise<void> => {
    try {
      // Les types non e-mailés sont réglés en lot, sans job : ils n'occupent jamais le lot.
      const skipped = await store.skipUnemailedTypes();
      if (skipped > 0) {
        logger.info({ skipped, reason: "type-not-emailed" }, "notification email sweep skipped");
      }
      const options = { now: now(), limit: SWEEP_BATCH_SIZE, windowHours: SWEEP_WINDOW_HOURS };
      const counts = await store.withPendingBatch(options, enqueueAll);
      if (counts.selected > 0) {
        logger.info(counts, "notification email sweep");
      }
    } catch (error) {
      // Le tick suivant est la reprise : on ne lève pas.
      logger.error({ error: errorNameOf(error) }, "notification email sweep failed");
    }
  };
}
