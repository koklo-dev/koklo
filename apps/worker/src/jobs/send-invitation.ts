import { buildInvitationMessage, type InvitationPayload } from "../mail/invitation-message.ts";
import type { MailSender } from "../mail/mail-sender.ts";

export const SEND_INVITATION_QUEUE = "send-invitation";

/** Mêmes réglages que le lien magique : le payload porte le lien, rétention d'une heure au plus. */
export const SEND_INVITATION_RETRY_LIMIT = 3;
export const SEND_INVITATION_RETENTION_SECONDS = 3600;

const FIELDS = ["email", "url", "inviterName", "organizationName", "role"] as const;

function isPayload(data: unknown): data is InvitationPayload {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return FIELDS.every((field) => typeof record[field] === "string" && record[field] !== "");
}

/** Handler de la file : valide le payload (jamais cité dans l'erreur : il porte le lien) puis envoie. */
export function createSendInvitationHandler(mailSender: MailSender) {
  return async (job: { id: string; data: unknown }): Promise<void> => {
    if (!isPayload(job.data)) {
      throw new Error("send-invitation: invalid payload");
    }
    await mailSender.send(buildInvitationMessage(job.data));
  };
}
