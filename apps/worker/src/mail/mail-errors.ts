/** `transient` : réessayer ; `permanent` : inutile de réessayer (la ligne passe en `failed`). */
export type MailDeliveryKind = "transient" | "permanent";

/** Code fermé : le message d'erreur ne cite jamais l'adresse, le corps ni le message du fournisseur. */
export type MailDeliveryCode =
  | "invalid-message"
  | "rejected"
  | "rate-limited"
  | "provider-unavailable"
  | "network";

/** SQUELETTE (TK-58a, étape rouge) : à implémenter à l'étape verte. */
export class MailDeliveryError extends Error {
  readonly kind!: MailDeliveryKind;
  readonly code!: MailDeliveryCode;

  constructor(_kind: MailDeliveryKind, _code: MailDeliveryCode) {
    super("not implemented");
    throw new Error("not implemented");
  }
}

export function isMailDeliveryError(_value: unknown): _value is MailDeliveryError {
  throw new Error("not implemented");
}
