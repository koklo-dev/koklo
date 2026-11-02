import type { MailMessage } from "./mail-sender.ts";

/** Longueurs maximales (caractères) des valeurs qui finissent dans un en-tête de protocole. */
export const MAIL_LIMITS = { address: 254, subject: 200, idempotencyKey: 256 } as const;

/** Seuls noms d'en-têtes additionnels admis ; `List-Unsubscribe` est reporté (pas de page de préférences). */
export const MAIL_HEADER_ALLOWLIST: readonly string[] = ["X-Entity-Ref-ID"];

/** SQUELETTES (TK-58a, étape rouge). Chaque garde lève `MailDeliveryError("permanent", "invalid-message")`. */
export function assertMailHeaderSafe(_field: "subject" | "idempotencyKey", _value: string): void {
  throw new Error("not implemented");
}

/** Une seule adresse `local@domaine`, sans CR/LF/NUL, espace, virgule, chevron ni point-virgule. */
export function assertMailAddress(_value: string): void {
  throw new Error("not implemented");
}

/** Applique toutes les gardes (to, subject, idempotencyKey, headers) : appelée par chaque adaptateur. */
export function assertMailMessageSafe(_message: MailMessage): void {
  throw new Error("not implemented");
}
