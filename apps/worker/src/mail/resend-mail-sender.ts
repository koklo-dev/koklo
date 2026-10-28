import type { MailMessage, MailSender } from "./mail-sender.ts";

/** Partie du client Resend utilisée ici : le SDK renvoie `{ data, error }` sans lever. */
export interface ResendClient {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<{ error: { name: string } | null }>;
  };
}

/** Envoi via Resend. L'erreur citée ne porte que son nom : jamais le corps (lien, jeton). */
export class ResendMailSender implements MailSender {
  constructor(
    private readonly client: ResendClient,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const { error } = await this.client.emails.send({ from: this.from, ...message });
    if (error) {
      throw new Error(`Resend a refusé l'envoi (${error.name})`);
    }
  }
}
