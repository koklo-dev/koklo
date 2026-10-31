/**
 * Charges de webhook normalisées (provider-neutres). Ce que le fournisseur envoie est réduit à ce
 * que les consommateurs lisent : aucun commit, auteur, e-mail, message ni expéditeur n'y figure,
 * si bien que la charge stockée ne porte aucune donnée personnelle de commit.
 */

/** Actions de l'événement `installation` prises en compte. */
export const INSTALLATION_WEBHOOK_ACTIONS = Object.freeze([
  "created",
  "deleted",
  "suspend",
  "unsuspend",
  "new_permissions_accepted",
] as const);

export type InstallationWebhookAction = (typeof INSTALLATION_WEBHOOK_ACTIONS)[number];

/** Compte propriétaire d'une installation. */
export type WebhookAccount = {
  readonly externalId: string;
  readonly login: string;
  readonly kind: "user" | "organization";
};

export type PushWebhook = {
  readonly event: "push";
  readonly deliveryId: string;
  readonly installationId: string;
  readonly repositoryId: string;
  readonly ref: string;
  /** Nom de la branche (après `refs/heads/`), `null` pour un tag ou une autre référence. */
  readonly branch: string | null;
  readonly before: string;
  readonly after: string;
  readonly created: boolean;
  readonly deleted: boolean;
  readonly forced: boolean;
};

export type InstallationWebhook = {
  readonly event: "installation";
  readonly deliveryId: string;
  readonly action: InstallationWebhookAction;
  readonly installationId: string;
  readonly account: WebhookAccount;
};

/** Enveloppe minimale des autres événements : aucun corps tant qu'aucun consommateur ne le lit. */
export type OtherWebhook = {
  readonly event:
    | "pull_request"
    | "pull_request_review"
    | "check_suite"
    | "check_run"
    | "workflow_run"
    | "deployment_status";
  readonly deliveryId: string;
  readonly action: string | null;
  readonly installationId: string | null;
  readonly repositoryId: string | null;
};

export type NormalizedWebhook = PushWebhook | InstallationWebhook | OtherWebhook;

/** Charge d'un job de la file : l'identifiant de la ligne de livraison, rien d'autre. */
export type WebhookDeliveryJob = { readonly deliveryId: string };

export const WEBHOOK_DELIVERY_QUEUE = "webhook-delivery";
export const WEBHOOK_PURGE_QUEUE = "webhook-purge";

/**
 * Clé de sérialisation d'une livraison : une installation à la fois, un push à la fois par
 * dépôt et par référence (deux pushes de la même branche ne s'exécutent pas en parallèle).
 */
export function webhookDeliverySingletonKey(webhook: PushWebhook | InstallationWebhook): string {
  return webhook.event === "installation"
    ? installationDeliveryKey(webhook.installationId)
    : pushDeliveryKey(webhook.repositoryId, webhook.ref);
}

/** Clés de sérialisation à partir des seuls champs qui les composent (réconciliation d'une livraison stockée). */
export const installationDeliveryKey = (installationId: string): string =>
  `installation:${installationId}`;
export const pushDeliveryKey = (repositoryId: string, ref: string): string =>
  `push:${repositoryId}:${ref}`;

/** Codes d'erreur d'une livraison en échec (liste fermée). */
export const WEBHOOK_DELIVERY_ERROR_CODES = Object.freeze([
  "invalid_payload",
  "unknown_installation",
  "unknown_repo",
  "repo_not_found",
  "provider_unavailable",
  "provider_auth_expired",
  "provider_rate_limited",
  "spec_too_large",
  "internal",
] as const);

export type WebhookDeliveryErrorCode = (typeof WEBHOOK_DELIVERY_ERROR_CODES)[number];

/** Rétention des livraisons, en jours. */
export const WEBHOOK_RETENTION_DAYS_DEFAULT = 30;
export const WEBHOOK_RETENTION_DAYS_MIN = 1;
export const WEBHOOK_RETENTION_DAYS_MAX = 365;

/** Taille maximale du corps d'un webhook accepté (5 Mio). */
export const WEBHOOK_MAX_BODY_BYTES = 5 * 1024 * 1024;
