import { describe, expect, it } from "vitest";
import { isMailDeliveryError, MailDeliveryError } from "./mail-errors.ts";

/** TK-58a : erreurs typées du port d'envoi (transitoire = réessayer, permanent = `failed` immédiat). */
describe("MailDeliveryError", () => {
  it("porte un type et un code fermés, et un message qui ne cite que le code", () => {
    const error = new MailDeliveryError("transient", "rate-limited");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("transient");
    expect(error.code).toBe("rate-limited");
    expect(error.message).toContain("rate-limited");
    expect(error.name).toBe("MailDeliveryError");
  });

  it("isMailDeliveryError reconnaît l'erreur typée et rien d'autre", () => {
    expect(isMailDeliveryError(new MailDeliveryError("permanent", "rejected"))).toBe(true);
    expect(isMailDeliveryError(new Error("x"))).toBe(false);
    expect(isMailDeliveryError({ kind: "permanent", code: "rejected" })).toBe(false);
    expect(isMailDeliveryError(null)).toBe(false);
  });
});
