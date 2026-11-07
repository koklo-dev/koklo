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
export const EMAILED_TYPES: readonly NotificationType[] = [
  "baseline.proposed",
  "review.submitted",
  "ticket.blocked",
];

/** Lot maximal par balayage et fenêtre de rattrapage (heures). */
export const SWEEP_BATCH_SIZE = 50;
export const SWEEP_WINDOW_HOURS = 24;

/**
 * Clé de préférence d'e-mail (`notification_preferences.key`, liste fermée du contrat 2.2.0, B101) de
 * chaque type déjà émis. Un type absent n'a pas de préférence : son e-mail part toujours. Toutes ces
 * clés sont activées par défaut (absence de ligne = envoyé).
 */
export const PREFERENCE_KEY_OF_TYPE: Readonly<Partial<Record<NotificationType, string>>> = {
  "baseline.proposed": "deliverable_to_validate",
  "review.submitted": "client_validation",
  "baseline.validated": "client_validation",
};
