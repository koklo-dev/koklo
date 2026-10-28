/** Message prêt à partir : le port ne connaît ni le fournisseur ni le gabarit. */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Port d'envoi d'emails. Une implémentation lève en cas d'échec pour que pg-boss réessaie. */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}
