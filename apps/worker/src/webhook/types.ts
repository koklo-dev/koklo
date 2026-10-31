import type { WebhookDeliveryErrorCode } from "@koklo/domain";

/** Résultat métier d'une livraison : écrit sur la ligne, le job termine normalement. */
export type DeliveryOutcome =
  | { readonly status: "processed" }
  | { readonly status: "ignored"; readonly errorCode?: WebhookDeliveryErrorCode }
  | { readonly status: "failed"; readonly errorCode: WebhookDeliveryErrorCode };

export const processed = (): DeliveryOutcome => ({ status: "processed" });

export const ignored = (errorCode?: WebhookDeliveryErrorCode): DeliveryOutcome =>
  errorCode === undefined ? { status: "ignored" } : { status: "ignored", errorCode };

export const failedWith = (errorCode: WebhookDeliveryErrorCode): DeliveryOutcome => ({
  status: "failed",
  errorCode,
});

/** Code d'erreur fermé à écrire (ou journaliser) pour un résultat ; `null` hors échec/ignoré motivé. */
export const errorCodeOf = (outcome: DeliveryOutcome): WebhookDeliveryErrorCode | null =>
  outcome.status === "processed" ? null : (outcome.errorCode ?? null);

/** Statuts après lesquels une livraison n'est plus retraitée (un `failed` peut être ré-enfilé). */
export const SETTLED_STATUSES: ReadonlySet<string> = new Set(["processed", "ignored"]);

/** Ligne de livraison lue par le job. La charge est ce que l'ingestion y a stocké (normalisée). */
export interface DeliveryRow {
  readonly id: string;
  readonly event: string;
  readonly status: string;
  readonly payload: unknown;
}

/** Charge `push` relue, réduite à ce que l'indexeur lit. */
export interface PushJob {
  readonly kind: "push";
  readonly installationId: string;
  readonly repositoryId: string;
  readonly ref: string;
  readonly after: string;
  /** Validé à la relecture, mais jamais lu pour décider : la branche est relue à l'exécution. */
  readonly deleted: boolean;
}

export interface InstallationJob {
  readonly kind: "installation";
  readonly action: string;
  readonly installationId: string;
}

/** Installation et dépôt résolus par la base (jamais par la charge), dont l'organisation. */
export interface Target {
  readonly installation: {
    readonly id: string;
    readonly organizationId: string;
    readonly externalId: string;
    readonly status: "active" | "suspended" | "deleted";
    readonly ownerKind: "organization" | "user";
    readonly ownerLogin: string;
  };
  readonly repo: {
    readonly id: string;
    readonly projectId: string;
    readonly name: string;
    readonly ownerLogin: string;
    readonly role: string;
    readonly specPath: string | null;
  };
}
