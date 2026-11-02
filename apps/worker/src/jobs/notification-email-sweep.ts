import type { Logger } from "@koklo/observability";
import type { NotificationEmailStore } from "../notification/store.ts";

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
  readonly store: Pick<NotificationEmailStore, "withPendingBatch">;
  readonly queue: NotificationJobQueue;
  readonly logger: Logger;
  readonly now?: () => Date;
}

/**
 * Handler du balayage (TK-58c) : sous verrou de lot, enfile un `send-notification-email`
 * `{ notificationId }` (singletonKey = id) par notification `pending` de la fenêtre. Ne lève jamais.
 */
export function createNotificationSweepHandler(_deps: NotificationSweepDeps) {
  return async (): Promise<void> => {
    // squelette : la logique vient à l'étape verte
  };
}
