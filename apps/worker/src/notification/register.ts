import type { PrismaClient } from "@koklo/db";
import type { Logger } from "@koklo/observability";
import type { PgBoss } from "pg-boss";
import type { NotificationEmailSettings } from "../jobs/send-notification-email.ts";
import type { MailSender } from "../mail/mail-sender.ts";

export interface NotificationEmailRegistration {
  readonly raw: PrismaClient;
  readonly mailSender: MailSender;
  /** Origine validée de `WEB_BASE_URL`. */
  readonly webBaseUrl: string;
}

/**
 * Files `notification-email-sweep` (planifiée chaque minute, une seule planification qui survit aux
 * redémarrages) et `send-notification-email` (4 reprises, backoff, expiration 120 s), avec leurs
 * consommateurs.
 */
export async function registerNotificationEmail(
  _boss: PgBoss,
  _logger: Logger,
  _deps: NotificationEmailRegistration,
  _overrides: Partial<NotificationEmailSettings> = {},
): Promise<void> {
  // squelette : la logique vient à l'étape verte
}
