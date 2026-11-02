import type { PrismaClient } from "@koklo/db";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import {
  createNotificationSweepHandler,
  NOTIFICATION_EMAIL_SWEEP_CRON,
  NOTIFICATION_EMAIL_SWEEP_QUEUE,
  NOTIFICATION_EMAIL_SWEEP_TIMEZONE,
} from "../jobs/notification-email-sweep.ts";
import {
  createSendNotificationEmailHandler,
  NOTIFICATION_EMAIL_DEFAULTS,
  type NotificationEmailSettings,
  SEND_NOTIFICATION_EMAIL_EXPIRE_SECONDS,
  SEND_NOTIFICATION_EMAIL_QUEUE,
  type SendNotificationEmailJob,
} from "../jobs/send-notification-email.ts";
import type { MailSender } from "../mail/mail-sender.ts";
import { instrumentJob } from "../observability.ts";
import { NotificationEmailStore } from "./store.ts";

export interface NotificationEmailRegistration {
  readonly raw: PrismaClient;
  readonly mailSender: MailSender;
  /** Origine validée de `WEB_BASE_URL`. */
  readonly webBaseUrl: string;
}

/**
 * `exclusive` : au plus un job `created|retry|active` par `singletonKey`, donc par notification. La
 * politique `standard` ne déduplique rien. pg-boss ne change jamais la politique d'une file : une
 * file `standard` laissée par une version précédente (jamais livrée) est supprimée puis recréée.
 */
async function ensureExclusiveQueue(
  boss: PgBoss,
  logger: Logger,
  options: Record<string, number | boolean>,
): Promise<void> {
  const existing = await boss.getQueue(SEND_NOTIFICATION_EMAIL_QUEUE);
  if (existing && existing.policy !== "exclusive") {
    logger.warn({ queue: SEND_NOTIFICATION_EMAIL_QUEUE }, "recreating the queue as exclusive");
    await boss.deleteQueue(SEND_NOTIFICATION_EMAIL_QUEUE);
  }
  await boss.createQueue(SEND_NOTIFICATION_EMAIL_QUEUE, { ...options, policy: "exclusive" });
}

/**
 * Files `notification-email-sweep` (planifiée chaque minute, une seule planification qui survit aux
 * redémarrages) et `send-notification-email` (4 reprises, backoff, expiration 120 s), avec leurs
 * consommateurs.
 */
export async function registerNotificationEmail(
  boss: PgBoss,
  logger: Logger,
  deps: NotificationEmailRegistration,
  overrides: Partial<NotificationEmailSettings> = {},
): Promise<void> {
  const settings = { ...NOTIFICATION_EMAIL_DEFAULTS, ...overrides };
  const store = new NotificationEmailStore(deps.raw);
  const options = {
    retryLimit: settings.retryLimit,
    retryDelay: settings.retryDelaySeconds,
    retryBackoff: true,
    expireInSeconds: SEND_NOTIFICATION_EMAIL_EXPIRE_SECONDS,
  };
  await ensureExclusiveQueue(boss, logger, options);
  // `createQueue` ne réécrit pas une file existante : les options restent celles du code.
  await boss.updateQueue(SEND_NOTIFICATION_EMAIL_QUEUE, options);
  const send = createSendNotificationEmailHandler({
    store,
    mailSender: deps.mailSender,
    logger,
    webBaseUrl: deps.webBaseUrl,
    retryLimit: settings.retryLimit,
  });
  await boss.work(
    SEND_NOTIFICATION_EMAIL_QUEUE,
    { localConcurrency: settings.concurrency },
    instrumentJob(
      logger,
      SEND_NOTIFICATION_EMAIL_QUEUE,
      (job: SendNotificationEmailJob) => send(job),
      {
        codeOnly: true,
      },
    ),
  );
  // Sans reprise : le tick suivant est la reprise.
  await boss.createQueue(NOTIFICATION_EMAIL_SWEEP_QUEUE, { retryLimit: 0 });
  const sweep = createNotificationSweepHandler({ store, queue: boss, logger });
  await boss.work(
    NOTIFICATION_EMAIL_SWEEP_QUEUE,
    instrumentJob(logger, NOTIFICATION_EMAIL_SWEEP_QUEUE, sweep, { codeOnly: true }),
  );
  await boss.schedule(NOTIFICATION_EMAIL_SWEEP_QUEUE, NOTIFICATION_EMAIL_SWEEP_CRON, null, {
    tz: NOTIFICATION_EMAIL_SWEEP_TIMEZONE,
  });
}
