import { escapeHtml } from "./html.ts";
import type { MailMessage } from "./mail-sender.ts";

export interface InvitationPayload {
  email: string;
  url: string;
  inviterName: string;
  organizationName: string;
  role: string;
}

/** Gabarit du message d'invitation (fonction pure : texte et html portent le même lien). */
export function buildInvitationMessage(payload: InvitationPayload): MailMessage {
  const { email, url, inviterName, organizationName, role } = payload;
  const sentence = (inviter: string, organization: string, roleName: string) =>
    `${inviter} vous invite à rejoindre ${organization} sur Koklo en tant que ${roleName}.`;
  const html = sentence(escapeHtml(inviterName), escapeHtml(organizationName), escapeHtml(role));
  return {
    to: email,
    subject: `Invitation à rejoindre ${organizationName} sur Koklo`,
    text: `Bonjour,\n\n${sentence(inviterName, organizationName, role)}\n\nPour accepter, ouvrez ce lien :\n${url}\n\nSi vous n'attendiez pas cette invitation, ignorez ce message.\n`,
    html: `<p>Bonjour,</p><p>${html}</p><p><a href="${escapeHtml(url)}">Accepter l'invitation</a></p><p>Si vous n'attendiez pas cette invitation, ignorez ce message.</p>`,
  };
}
