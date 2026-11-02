import type { Logger } from "@koklo/observability";
import {
  errorNameOf,
  QUEUE_DEFAULTS,
  type QueueSettings,
  TransientJobError,
  uuidFieldOf,
} from "../job-support.ts";
import { type MailDeliveryCode, MailDeliveryError } from "../mail/mail-errors.ts";
import type { MailSender } from "../mail/mail-sender.ts";
import { buildNotificationMessage } from "../mail/notification-message.ts";
import type { NotificationEmailContext, NotificationEmailStore } from "../notification/store.ts";

export const SEND_NOTIFICATION_EMAIL_QUEUE = "send-notification-email";

/** Essais et concurrence de la file d'envoi : 4 reprises, 30 s de base avec backoff exponentiel. */
export type NotificationEmailSettings = QueueSettings;
export const NOTIFICATION_EMAIL_DEFAULTS: NotificationEmailSettings = {
  ...QUEUE_DEFAULTS,
  retryDelaySeconds: 30,
};
/** Un envoi appelle le fournisseur ; au-delà, pg-boss considère le job perdu et le rejoue. */
export const SEND_NOTIFICATION_EMAIL_EXPIRE_SECONDS = 120;

/** Job reçu de pg-boss : `retryCount` compte les reprises déjà faites. */
export interface SendNotificationEmailJob {
  id: string;
  data: unknown;
  retryCount: number;
}

export interface SendNotificationEmailDeps {
  readonly store: Pick<
    NotificationEmailStore,
    "claimForSend" | "markSent" | "markSkipped" | "markFailed"
  >;
  readonly mailSender: MailSender;
  readonly logger: Logger;
  /** Origine validée de `WEB_BASE_URL`. */
  readonly webBaseUrl: string;
  readonly retryLimit: number;
  readonly now?: () => Date;
}

/**
 * Handler du job `{ notificationId }` (TK-58c). Relit la ligne (`claimForSend`), envoie le message
 * figé avec la clé d'idempotence `notification:<id>`, puis marque `sent|failed`. Seule une panne
 * transitoire avant le dernier essai lève (`TransientJobError`, code seul) ; tout le reste termine.
 */
export function createSendNotificationEmailHandler(deps: SendNotificationEmailDeps) {
  const { store, mailSender, logger, webBaseUrl, retryLimit } = deps;
  const now = deps.now ?? (() => new Date());

  const messageOf = (context: NotificationEmailContext) =>
    buildNotificationMessage({
      notificationId: context.id,
      to: context.recipientEmail,
      type: context.type,
      organizationName: context.organizationName,
      projectId: context.projectId,
      subjectKind: context.subjectKind,
      subjectRef: context.subjectRef,
      webBaseUrl,
    });

  /** Permanent -> `failed` ; transitoire avant le dernier essai -> relance (code seul). */
  const settleFailure = async (job: SendNotificationEmailJob, id: string, error: unknown) => {
    const known = error instanceof MailDeliveryError;
    const code: MailDeliveryCode = known ? error.code : "network";
    logger.warn({ code, error: errorNameOf(error), retryCount: job.retryCount }, "email failed");
    if (known && error.kind === "permanent") {
      await store.markFailed(id);
    } else if (job.retryCount < retryLimit) {
      throw new TransientJobError(SEND_NOTIFICATION_EMAIL_QUEUE, code);
    } else {
      await store.markFailed(id);
    }
  };

  return async (job: SendNotificationEmailJob): Promise<void> => {
    const id = uuidFieldOf(job.data, "notificationId");
    if (id === undefined) {
      logger.warn({ jobId: job.id }, "send-notification-email: invalid payload");
      return;
    }
    const claim = await store.claimForSend(id);
    if (claim.kind !== "ready") {
      return;
    }
    try {
      await mailSender.send(messageOf(claim.context));
    } catch (error) {
      await settleFailure(job, id, error);
      return;
    }
    if (!(await store.markSent(id, now()))) {
      // Signal d'un double envoi possible : la ligne n'était plus `pending` (jamais de contenu).
      logger.warn({ jobId: job.id }, "send-notification-email: row not pending after send");
    }
  };
}
