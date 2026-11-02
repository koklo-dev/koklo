/** Types fermés de `notifications.type` (CHECK de TK-51d). */
export const NOTIFICATION_TYPES = [
  "suggestion.created",
  "suggestion.decided",
  "review.submitted",
  "baseline.proposed",
  "baseline.validated",
  "baseline.tagged",
  "ticket.blocked",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SUBJECT_KINDS = ["suggestion", "review", "baseline", "ticket"] as const;
export type NotificationSubjectKind = (typeof NOTIFICATION_SUBJECT_KINDS)[number];

export const EMAIL_STATES = ["pending", "sent", "skipped", "failed"] as const;
export type EmailState = (typeof EMAIL_STATES)[number];

/** Types qui déclenchent réellement un e-mail (D2) ; les autres passent `skipped`. */
export const EMAILED_TYPES: readonly NotificationType[] = [];

/** Lot maximal par balayage et fenêtre de rattrapage (heures). */
export const SWEEP_BATCH_SIZE = 50;
export const SWEEP_WINDOW_HOURS = 24;
