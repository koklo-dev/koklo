import type { MailDeliveryKind } from "./mail-errors.ts";
import type { MailMessage, MailSender } from "./mail-sender.ts";

/**
 * Adaptateur sans réseau : garde les messages en mémoire (développement, tests). TK-58a : échecs
 * scriptés (`failNext`) et dédoublonnage par `idempotencyKey` (comme le fournisseur).
 */
export class CaptureMailSender implements MailSender {
  private readonly messages: MailMessage[] = [];

  get sent(): readonly MailMessage[] {
    return this.messages;
  }

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }

  /** SQUELETTE : le prochain `send` lève `MailDeliveryError(kind, …)` ; un seul échec par appel. */
  failNext(_kind: MailDeliveryKind): void {
    // à implémenter à l'étape verte
  }

  clear(): void {
    this.messages.length = 0;
  }
}
