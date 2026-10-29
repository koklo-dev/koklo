import { escapeHtml } from "./html.ts";
import type { MailMessage } from "./mail-sender.ts";

const SUBJECT = "Votre lien de connexion à Koklo";

/** Gabarit du message de connexion (fonction pure : texte et html portent le même lien). */
export function buildMagicLinkMessage({ email, url }: { email: string; url: string }): MailMessage {
  const href = escapeHtml(url);
  return {
    to: email,
    subject: SUBJECT,
    text: `Bonjour,\n\nPour vous connecter à Koklo, ouvrez ce lien :\n${url}\n\nIl est valable quelques minutes et ne sert qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n`,
    html: `<p>Bonjour,</p><p>Pour vous connecter à Koklo, <a href="${href}">ouvrez ce lien</a>.</p><p>Il est valable quelques minutes et ne sert qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`,
  };
}
