import { createHmac } from "node:crypto";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvalidWebhookPayloadError,
  normalizeWebhook,
  verifyWebhookSignature,
  WebhookSecretMissingError,
} from "../src/index.ts";
import { pushPayload } from "./support/webhook-payloads.ts";

/**
 * TK-45a : ni le secret du webhook, ni la signature attendue, ni le corps ne sortent dans une
 * valeur de retour, une erreur (message, pile, JSON, inspect) ou un journal de console.
 */
const SECRET = "WEBHOOK-SECRET-SENTINEL-5c1d7e";
const body = new TextEncoder().encode('{"hello":"BODY-SENTINEL-31ab"}');
const expected = createHmac("sha256", SECRET).update(body).digest("hex");

const surfaces = (error: unknown): string[] => {
  const e = error as Error;
  return [
    e.message,
    e.stack ?? "",
    String(e),
    JSON.stringify(e),
    inspect(e, { depth: 10, showHidden: true }),
    String(e.cause ?? ""),
  ];
};
const FORBIDDEN = [SECRET, expected, expected.toUpperCase(), "BODY-SENTINEL-31ab"];

afterEach(() => vi.restoreAllMocks());

describe("TK-45a aucune fuite du secret ni de la signature", () => {
  it("aucun journal de console pendant une vérification (valide, fausse, mal formée)", () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    for (const header of [
      `sha256=${expected}`,
      `sha256=${"0".repeat(64)}`,
      "sha1=abc",
      undefined,
    ]) {
      verifyWebhookSignature({ secret: SECRET, rawBody: body, header });
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("la valeur de retour est un booléen strict, rien d'autre", () => {
    for (const header of [`sha256=${expected}`, `sha256=${"0".repeat(64)}`, "x", undefined, null]) {
      const result = verifyWebhookSignature({ secret: SECRET, rawBody: body, header });
      expect(typeof result).toBe("boolean");
    }
  });

  it("WebhookSecretMissingError ne contient ni signature attendue ni signature reçue ni corps", () => {
    const received = `sha256=${createHmac("sha256", "").update(body).digest("hex")}`;
    let thrown: unknown;
    try {
      verifyWebhookSignature({ secret: "", rawBody: body, header: received });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WebhookSecretMissingError);
    for (const surface of surfaces(thrown)) {
      expect(surface).not.toContain(received);
      expect(surface).not.toContain(received.slice(7));
      expect(surface).not.toContain("BODY-SENTINEL-31ab");
    }
  });

  it("un secret fourni puis un rejet : aucune exception, donc rien à fuiter", () => {
    expect(() =>
      verifyWebhookSignature({ secret: SECRET, rawBody: body, header: `sha256=${"f".repeat(64)}` }),
    ).not.toThrow();
  });

  it("InvalidWebhookPayloadError ne contient aucune valeur de la charge (ni secret ni e-mail)", () => {
    const payload = pushPayload({ ref: { secret: SECRET }, note: SECRET });
    let thrown: unknown;
    try {
      normalizeWebhook("push", "0f8fad5b-d9cb-469f-a165-70867728950e", payload);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidWebhookPayloadError);
    for (const surface of surfaces(thrown)) {
      for (const forbidden of FORBIDDEN) expect(surface).not.toContain(forbidden);
      expect(surface).not.toContain("alice.durand.sentinel@example.invalid");
    }
    expect((thrown as Error).cause).toBeUndefined();
  });

  it("le nom d'événement d'un refus est tronqué à 64 caractères", () => {
    let thrown: unknown;
    try {
      normalizeWebhook("e".repeat(5_000), "0f8fad5b-d9cb-469f-a165-70867728950e", {});
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidWebhookPayloadError);
    expect((thrown as InvalidWebhookPayloadError).event.length).toBeLessThanOrEqual(64);
    for (const surface of surfaces(thrown)) expect(surface.length).toBeLessThan(5_000);
  });
});
