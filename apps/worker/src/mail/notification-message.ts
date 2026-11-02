import type { NotificationSubjectKind, NotificationType } from "../notification/types.ts";
import { escapeHtml } from "./html.ts";
import { MailDeliveryError } from "./mail-errors.ts";
import { assertMailMessageSafe } from "./mail-guards.ts";
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
> = {
  "suggestion.created": {
    subject: "Une nouvelle suggestion vous attend sur Koklo",
    lead: "Une nouvelle suggestion a été créée.",
  },
  "suggestion.decided": {
    subject: "Une suggestion a reçu une décision sur Koklo",
    lead: "Une décision a été prise sur une suggestion.",
  },
  "review.submitted": {
    subject: "Une validation vous est demandée sur Koklo",
    lead: "Une review a été soumise et attend votre avis.",
  },
  "baseline.proposed": {
    subject: "Une baseline est proposée à votre validation sur Koklo",
    lead: "Une baseline a été proposée et attend votre validation.",
  },
  "baseline.validated": {
    subject: "Une baseline a été validée sur Koklo",
    lead: "Une baseline a été validée.",
  },
  "baseline.tagged": {
    subject: "Une baseline a été figée sur Koklo",
    lead: "Une baseline a reçu son étiquette.",
  },
  "ticket.blocked": {
    subject: "Un ticket est bloqué sur Koklo",
    lead: "Un ticket est bloqué et demande votre attention.",
  },
};

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID = new RegExp(`^${UUID_PATTERN}$`);
/** Longueur maximale d'une clé de sujet (CHECK `notifications_subject_ref_length_check`). */
const SUBJECT_REF_MAX = 64;

/** Formats de clé acceptés par genre (regex ancrées) ; tout le reste est refusé. */
export const SUBJECT_REF_PATTERNS: Readonly<Record<NotificationSubjectKind, RegExp>> = {
  suggestion: /^SG-[1-9][0-9]*$/,
  ticket: /^TK-[1-9][0-9]*$/,
  baseline: /^baseline-(0|[1-9][0-9]*)$/,
  review: UUID,
};

export function isValidSubjectRef(kind: NotificationSubjectKind, ref: string): boolean {
  return ref.length <= SUBJECT_REF_MAX && SUBJECT_REF_PATTERNS[kind].test(ref);
}

function invalid(): never {
  throw new MailDeliveryError("permanent", "invalid-message");
}

/** `<base>/projects/<projet>/<genre>/<clé>` (segments encodés) ; sans projet `<base>/notifications`. */
export function buildNotificationLink(input: NotificationMessageInput): string {
  if (input.projectId === null) {
    return `${input.webBaseUrl}/notifications`;
  }
  if (!UUID.test(input.projectId)) {
    invalid();
  }
  const segments = [input.projectId, input.subjectKind, input.subjectRef].map(encodeURIComponent);
  return `${input.webBaseUrl}/projects/${segments[0]}/${segments[1]}/${segments[2]}`;
}

/** Fonction pure ; lève `MailDeliveryError("permanent", "invalid-message")` si la clé est hors format. */
export function buildNotificationMessage(input: NotificationMessageInput): MailMessage {
  if (!isValidSubjectRef(input.subjectKind, input.subjectRef)) {
    invalid();
  }
  const { lead, subject } = NOTIFICATION_COPY[input.type];
  const link = buildNotificationLink(input);
  const org = input.organizationName;
  const ref = input.subjectRef;
  const message: MailMessage = {
    to: input.to,
    subject,
    text: `Bonjour,\n\n${lead}\nOrganisation : ${org}\nRéférence : ${ref}\n\nPour la consulter, ouvrez ce lien :\n${link}\n`,
    html: `<p>Bonjour,</p><p>${escapeHtml(lead)}</p><p>Organisation : ${escapeHtml(org)}<br>Référence : ${escapeHtml(ref)}</p><p><a href="${escapeHtml(link)}">Ouvrir dans Koklo</a></p>`,
    idempotencyKey: `notification:${input.notificationId}`,
    headers: { "X-Entity-Ref-ID": input.notificationId },
  };
  assertMailMessageSafe(message);
  return message;
}
