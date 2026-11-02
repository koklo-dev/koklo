import { MailDeliveryError } from "./mail-errors.ts";
import type { MailMessage } from "./mail-sender.ts";

/** Longueurs maximales (caractères) des valeurs qui finissent dans un en-tête de protocole. */
export const MAIL_LIMITS = { address: 254, subject: 200, idempotencyKey: 256 } as const;

/** Seuls noms d'en-têtes additionnels admis ; `List-Unsubscribe` est reporté (pas de page de préférences). */
export const MAIL_HEADER_ALLOWLIST: readonly string[] = ["X-Entity-Ref-ID"];

const CONTROL_CHARS = /[\r\n\0\u2028\u2029]/;
const ADDRESS_PATTERN = /^[^\s@<>,;"()[\]\\]+@[^\s@<>,;"()[\]\\.]+(?:\.[^\s@<>,;"()[\]\\.]+)+$/;

function refuse(): never {
  throw new MailDeliveryError("permanent", "invalid-message");
}

/** Valeur d'en-tête : non vide, bornée, sans saut de ligne ni NUL ni espace de bord. */
function assertHeaderValue(value: string, max: number): void {
  if (value.length === 0 || value.length > max || CONTROL_CHARS.test(value)) {
    refuse();
  }
  if (value !== value.trim()) {
    refuse();
  }
}

export function assertMailHeaderSafe(field: "subject" | "idempotencyKey", value: string): void {
  assertHeaderValue(value, MAIL_LIMITS[field]);
}

/** Une seule adresse `local@domaine`, sans CR/LF/NUL, espace, virgule, chevron ni point-virgule. */
export function assertMailAddress(value: string): void {
  if (value.length > MAIL_LIMITS.address || CONTROL_CHARS.test(value)) {
    refuse();
  }
  if (!ADDRESS_PATTERN.test(value)) {
    refuse();
  }
}

function assertHeaders(headers: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(headers)) {
    if (!MAIL_HEADER_ALLOWLIST.includes(name)) {
      refuse();
    }
    assertHeaderValue(value, MAIL_LIMITS.subject);
  }
}

/** Applique toutes les gardes (to, subject, idempotencyKey, headers) : appelée par chaque adaptateur. */
export function assertMailMessageSafe(message: MailMessage): void {
  assertMailAddress(message.to);
  assertMailHeaderSafe("subject", message.subject);
  if (message.idempotencyKey !== undefined) {
    assertMailHeaderSafe("idempotencyKey", message.idempotencyKey);
  }
  if (message.headers !== undefined) {
    assertHeaders(message.headers);
  }
}
