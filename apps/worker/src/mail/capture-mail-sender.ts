import type { MailMessage, MailSender } from "./mail-sender.ts";

/** Adaptateur sans réseau : garde les messages en mémoire (développement, tests). */
export class CaptureMailSender implements MailSender {
  private readonly messages: MailMessage[] = [];

  get sent(): readonly MailMessage[] {
    return this.messages;
  }

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }

  clear(): void {
    this.messages.length = 0;
  }
}
