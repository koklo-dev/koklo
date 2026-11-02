/** `transient` : réessayer ; `permanent` : inutile de réessayer (la ligne passe en `failed`). */
export type MailDeliveryKind = "transient" | "permanent";

/** Code fermé : le message d'erreur ne cite jamais l'adresse, le corps ni le message du fournisseur. */
export type MailDeliveryCode =
  | "invalid-message"
  | "rejected"
  | "rate-limited"
  | "provider-unavailable"
  | "network"
  | "idempotency-conflict";

/** Échec d'envoi typé : le message ne contient que le code fermé. */
export class MailDeliveryError extends Error {
  readonly kind: MailDeliveryKind;
  readonly code: MailDeliveryCode;

  constructor(kind: MailDeliveryKind, code: MailDeliveryCode) {
    super(code);
    this.name = "MailDeliveryError";
    this.kind = kind;
    this.code = code;
  }
}

export function isMailDeliveryError(value: unknown): value is MailDeliveryError {
  return value instanceof MailDeliveryError;
}
