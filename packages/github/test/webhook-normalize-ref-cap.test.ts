import { describe, expect, it } from "vitest";
import { InvalidWebhookPayloadError, normalizeWebhook } from "../src/index.ts";
import { DELIVERY_ID, pushPayload } from "./support/webhook-payloads.ts";

/**
 * TK-45b (report de 45a) : la longueur de `ref` est plafonnée à 255 caractères à la normalisation,
 * car elle alimente la clé de file `push:<dépôt>:<ref>` du worker. Au-delà : charge invalide
 * (`malformed_payload`), jamais tronquée en silence.
 */
const refOf = (length: number) => `refs/heads/${"a".repeat(length - "refs/heads/".length)}`;

describe("plafond de la longueur de ref", () => {
  it("255 caractères : accepté tel quel", () => {
    const ref = refOf(255);
    expect(ref).toHaveLength(255);
    expect(normalizeWebhook("push", DELIVERY_ID, pushPayload({ ref }))).toMatchObject({ ref });
  });

  it.each([256, 1_000, 100_000])("%d caractères : refusé (malformed_payload)", (length) => {
    let error: unknown;
    try {
      normalizeWebhook("push", DELIVERY_ID, pushPayload({ ref: refOf(length) }));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(InvalidWebhookPayloadError);
    expect(error).toMatchObject({ code: "invalid_payload", reason: "malformed_payload" });
    expect((error as Error).message).not.toContain("aaaa");
  });
});
