import { MailDeliveryError } from "./mail-errors.ts";
import { assertMailMessageSafe } from "./mail-guards.ts";
import type { MailMessage, MailSender } from "./mail-sender.ts";

/** Partie du client Resend utilisée ici : le SDK renvoie `{ data, error }` sans lever. */
export interface ResendClient {
  emails: {
    send(
      payload: {
        from: string;
        to: string;
        subject: string;
        text: string;
        html: string;
        headers?: Record<string, string>;
      },
      options?: { idempotencyKey?: string },
    ): Promise<{ error: { name: string; statusCode?: number | null } | null }>;
  };
}

/**
 * 429, 409 et 5xx : réessayer ; autre 4xx : refus définitif ; sans statut : le transport a échoué.
 * Le 409 (même clé d'idempotence en cours de traitement) ne prouve pas que le message n'est pas
 * parti : jamais `failed`, la clé rend le renvoi sûr.
 */
function classify(statusCode: number | null | undefined): MailDeliveryError {
  if (statusCode === 409) {
    return new MailDeliveryError("transient", "idempotency-conflict");
  }
  if (statusCode === 429) {
    return new MailDeliveryError("transient", "rate-limited");
  }
  if (statusCode == null) {
    return new MailDeliveryError("transient", "network");
  }
  return statusCode >= 500
    ? new MailDeliveryError("transient", "provider-unavailable")
    : new MailDeliveryError("permanent", "rejected");
}

/** Envoi via Resend. L'erreur levée ne porte qu'un code fermé : jamais le corps, l'adresse ni la clé. */
export class ResendMailSender implements MailSender {
  private readonly client: ResendClient;
  private readonly from: string;
  constructor(client: ResendClient, from: string) {
    this.client = client;
    this.from = from;
  }

  async send(message: MailMessage): Promise<void> {
    assertMailMessageSafe(message);
    const { idempotencyKey, headers, ...content } = message;
    const payload = {
      from: this.from,
      ...content,
      ...(headers ? { headers: { ...headers } } : {}),
    };
    let result: Awaited<ReturnType<ResendClient["emails"]["send"]>>;
    try {
      result =
        idempotencyKey === undefined
          ? await this.client.emails.send(payload)
          : await this.client.emails.send(payload, { idempotencyKey });
    } catch {
      throw new MailDeliveryError("transient", "network");
    }
    if (result.error) {
      throw classify(result.error.statusCode);
    }
  }
}
