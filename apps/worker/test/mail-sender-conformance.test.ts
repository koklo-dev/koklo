import { CaptureMailSender } from "../src/mail/capture-mail-sender.ts";
import type { MailMessage } from "../src/mail/mail-sender.ts";
import { type ResendClient, ResendMailSender } from "../src/mail/resend-mail-sender.ts";
import {
  type MailSenderHarness,
  runMailSenderConformance,
} from "./support/mail-sender-conformance.ts";

/**
 * TK-58a : la même suite de conformité sur les deux adaptateurs du port. `CaptureMailSender` est le
 * faux déterministe (échecs scriptés, dédoublonnage par clé) ; `ResendMailSender` parle à un client
 * simulé qui reproduit le fournisseur (clé d'idempotence, statuts HTTP). Jamais le réseau.
 */
runMailSenderConformance("CaptureMailSender", (): MailSenderHarness => {
  const sender = new CaptureMailSender();
  return {
    sender,
    delivered: () => sender.sent,
    failNext: (kind) => sender.failNext(kind),
  };
});

/** Client Resend simulé : rejoue une réponse scriptée, dédoublonne par clé comme le fournisseur. */
function fakeResendProvider() {
  const delivered: MailMessage[] = [];
  const seen = new Set<string>();
  let next: { name: string; statusCode: number | null } | null = null;
  const client: ResendClient = {
    emails: {
      async send(payload, options) {
        if (next) {
          const error = next;
          next = null;
          return { error };
        }
        const key = options?.idempotencyKey;
        if (key === undefined || !seen.has(key)) {
          if (key !== undefined) seen.add(key);
          const { from: _from, ...rest } = payload;
          delivered.push({ ...rest, ...(key === undefined ? {} : { idempotencyKey: key }) });
        }
        return { error: null };
      },
    },
  };
  return {
    client,
    delivered,
    script: (error: { name: string; statusCode: number | null }) => {
      next = error;
    },
  };
}

runMailSenderConformance("ResendMailSender (client simulé)", (): MailSenderHarness => {
  const provider = fakeResendProvider();
  return {
    sender: new ResendMailSender(provider.client, "Koklo <no-reply@koklo.dev>"),
    delivered: () => provider.delivered,
    failNext: (kind) =>
      provider.script(
        kind === "transient"
          ? { name: "internal_server_error", statusCode: 500 }
          : { name: "validation_error", statusCode: 422 },
      ),
  };
});
