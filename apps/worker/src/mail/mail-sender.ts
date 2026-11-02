/** Message prêt à partir : le port ne connaît ni le fournisseur ni le gabarit. */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Même clé = même envoi logique : le fournisseur (et la capture) n'envoie pas deux fois. */
  readonly idempotencyKey?: string;
  /** En-têtes additionnels, limités à `MAIL_HEADER_ALLOWLIST` (valeurs sans CR, LF ni NUL). */
  readonly headers?: Readonly<Record<string, string>>;
}

/** Port d'envoi d'emails. Une implémentation lève `MailDeliveryError` en cas d'échec. */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}
