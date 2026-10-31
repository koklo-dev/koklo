/**
 * Constantes de la réconciliation périodique du worker (rattrapage des événements perdus).
 * Pures, sans I/O. Le cron et le fuseau de la planification restent dans le worker.
 */

/** File pg-boss du job planifié ; il n'a pas de charge utile. */
export const RECONCILE_QUEUE = "reconcile";

/**
 * Âge minimal, en minutes, d'une ligne non réglée avant d'être jugée orpheline : plus long que
 * l'expiration d'un job pg-boss (5 min), pour ne jamais doubler un job encore légitime.
 */
export const RECONCILE_GRACE_MINUTES_DEFAULT = 15;
export const RECONCILE_GRACE_MINUTES_MIN = 5;
export const RECONCILE_GRACE_MINUTES_MAX = 1440;

/** Plafond de lignes ré-enfilées par passe et par run ; le reste attend le tick suivant. */
export const RECONCILE_MAX_REQUEUES_DEFAULT = 200;

/** Clé du verrou consultatif Postgres qui empêche deux réconciliations simultanées. */
export const RECONCILE_LOCK_KEY = 460_046;
