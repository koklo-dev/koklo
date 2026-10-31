import { createHmac, timingSafeEqual } from "node:crypto";

/** Le secret de signature n'est pas configuré : aucune livraison ne peut être authentifiée. */
export class WebhookSecretMissingError extends Error {
  constructor() {
    super("GITHUB_WEBHOOK_SECRET is not configured: webhook signatures cannot be verified");
    this.name = "WebhookSecretMissingError";
  }
}

const SIGNATURE_PATTERN = /^sha256=([0-9a-fA-F]{64})$/;

export type VerifyWebhookSignatureInput = {
  readonly secret: string | null | undefined;
  readonly rawBody: Uint8Array;
  readonly header: string | null | undefined;
};

/**
 * Vérifie `X-Hub-Signature-256` : HMAC-SHA256 des octets bruts reçus, comparé en temps constant
 * (deux tampons de 32 octets). Seul SHA-256 est accepté. Un secret absent lève
 * `WebhookSecretMissingError` avant tout calcul ; une signature absente, mal formée ou fausse
 * renvoie `false`. Rien n'est journalisé.
 */
export function verifyWebhookSignature(input: VerifyWebhookSignatureInput): boolean {
  const { secret, rawBody, header } = input;
  if (secret === undefined || secret === null || secret === "") {
    throw new WebhookSecretMissingError();
  }
  const match = typeof header === "string" ? SIGNATURE_PATTERN.exec(header) : null;
  if (match === null) return false;
  const received = Buffer.from(match[1] as string, "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(received, expected);
}
