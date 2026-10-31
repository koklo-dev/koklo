import { describe, expect, it } from "vitest";
import { InvalidWebhookPayloadError, normalizeWebhook } from "../src/index.ts";
import { DELIVERY_ID, installationPayload, pushPayload } from "./support/webhook-payloads.ts";

/** TK-45a refactor : un caractère de contrôle (dont NUL, que jsonb refuse) rend la charge invalide. */
describe("TK-45a caractères de contrôle", () => {
  it.each(["refs/heads/a\u0000b", "refs/heads/a\nb", "refs/heads/a\u007fb"])(
    "refuse la ref %j",
    (ref) => {
      expect(() => normalizeWebhook("push", DELIVERY_ID, pushPayload({ ref }))).toThrow(
        InvalidWebhookPayloadError,
      );
    },
  );

  it("refuse un login de compte contenant un caractère de contrôle", () => {
    const payload = installationPayload("created") as {
      installation: { account: { login: string } };
    };
    payload.installation.account.login = "acme\u0000";
    expect(() => normalizeWebhook("installation", DELIVERY_ID, payload)).toThrow(
      InvalidWebhookPayloadError,
    );
  });
});
