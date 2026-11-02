import { MailDeliveryError, type MailDeliveryKind } from "./mail-errors.ts";
import { assertMailMessageSafe } from "./mail-guards.ts";
import type { MailMessage, MailSender } from "./mail-sender.ts";

/**
 * Adaptateur sans réseau : garde les messages en mémoire (développement, tests). Échecs scriptés
 * (`failNext`) et dédoublonnage par `idempotencyKey` (comme le fournisseur).
 */
export class CaptureMailSender implements MailSender {
  private readonly messages: MailMessage[] = [];
  private pendingFailure: MailDeliveryKind | undefined;

  get sent(): readonly MailMessage[] {
    return this.messages;
  }

  async send(message: MailMessage): Promise<void> {
    assertMailMessageSafe(message);
    if (this.pendingFailure !== undefined) {
      const kind = this.pendingFailure;
      this.pendingFailure = undefined;
      throw new MailDeliveryError(kind, kind === "transient" ? "provider-unavailable" : "rejected");
    }
    const key = message.idempotencyKey;
    if (key !== undefined && this.messages.some((sent) => sent.idempotencyKey === key)) {
      return;
    }
    this.messages.push(message);
  }

  /** Le prochain `send` lève `MailDeliveryError(kind, …)` ; un seul échec par appel. */
  failNext(kind: MailDeliveryKind): void {
    this.pendingFailure = kind;
  }

  clear(): void {
    this.messages.length = 0;
    this.pendingFailure = undefined;
  }
}
