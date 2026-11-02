import type { NotificationSubjectKind, NotificationType } from "../notification/types.ts";
import type { MailMessage } from "./mail-sender.ts";

export interface NotificationMessageInput {
  readonly notificationId: string;
  readonly to: string;
  readonly type: NotificationType;
  readonly organizationName: string;
  readonly projectId: string | null;
  readonly subjectKind: NotificationSubjectKind;
  readonly subjectRef: string;
  /** Origine validée de `WEB_BASE_URL` (jamais lue ailleurs que dans la configuration). */
  readonly webBaseUrl: string;
}

/** Dictionnaire figé par type : sujet et phrase d'accroche (aucun texte libre). */
export const NOTIFICATION_COPY: Readonly<
  Record<NotificationType, { subject: string; lead: string }>
> = {} as never;

/** Formats de clé acceptés par genre (regex ancrées) ; tout le reste est refusé. */
export const SUBJECT_REF_PATTERNS: Readonly<Record<NotificationSubjectKind, RegExp>> = {} as never;

/** SQUELETTES (TK-58b, étape rouge). */
export function isValidSubjectRef(_kind: NotificationSubjectKind, _ref: string): boolean {
  throw new Error("not implemented");
}

/** `<base>/projects/<projet>/<genre>/<clé>` (segments encodés) ; sans projet `<base>/notifications`. */
export function buildNotificationLink(_input: NotificationMessageInput): string {
  throw new Error("not implemented");
}

/** Fonction pure ; lève `MailDeliveryError("permanent", "invalid-message")` si la clé est hors format. */
export function buildNotificationMessage(_input: NotificationMessageInput): MailMessage {
  throw new Error("not implemented");
}
