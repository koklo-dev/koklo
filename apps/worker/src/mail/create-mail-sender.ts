import { Resend } from "resend";
import type { MailConfig } from "../config.ts";
import { CaptureMailSender } from "./capture-mail-sender.ts";
import type { MailSender } from "./mail-sender.ts";
import { ResendMailSender } from "./resend-mail-sender.ts";

/** Choisit l'adaptateur d'après la configuration ; la capture n'instancie pas le SDK. */
export function createMailSender(mail: MailConfig): MailSender {
  return mail.kind === "resend"
    ? new ResendMailSender(new Resend(mail.apiKey), mail.from)
    : new CaptureMailSender();
}
