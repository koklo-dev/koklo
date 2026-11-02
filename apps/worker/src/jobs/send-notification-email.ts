import type { Logger } from "@koklo/observability";
import { QUEUE_DEFAULTS, type QueueSettings } from "../job-support.ts";
import type { MailSender } from "../mail/mail-sender.ts";
import type { NotificationEmailStore } from "../notification/store.ts";

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
export function createSendNotificationEmailHandler(_deps: SendNotificationEmailDeps) {
  return async (_job: SendNotificationEmailJob): Promise<void> => {
    // squelette : la logique vient à l'étape verte
  };
}
