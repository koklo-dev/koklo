import { buildMagicLinkMessage } from "../mail/magic-link-message.ts";
import type { MailSender } from "../mail/mail-sender.ts";

export const SEND_MAGIC_LINK_QUEUE = "send-magic-link";

/** Essais pg-boss : échec transitoire du fournisseur, le handler est idempotent côté lecteur. */
export const SEND_MAGIC_LINK_RETRY_LIMIT = 3;
/** Le payload contient le lien : rétention d'une heure au plus (job terminé comme archivé). */
export const SEND_MAGIC_LINK_RETENTION_SECONDS = 3600;

interface Payload {
  email: string;
  url: string;
}

function isPayload(data: unknown): data is Payload {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const { email, url } = data as Record<string, unknown>;
  return typeof email === "string" && email !== "" && typeof url === "string" && url !== "";
}

/**
 * Handler de la file : valide le payload puis envoie. Les erreurs ne citent jamais le payload
 * (il porte le jeton) ; l'erreur d'envoi est relancée telle quelle pour le réessai.
 */
export function createSendMagicLinkHandler(mailSender: MailSender) {
  return async (job: { id: string; data: unknown }): Promise<void> => {
    if (!isPayload(job.data)) {
      throw new Error("send-magic-link: invalid payload");
    }
    await mailSender.send(buildMagicLinkMessage(job.data));
  };
}
