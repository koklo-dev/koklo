import { describe, expect, it } from "vitest";
import {
  LlmInvalidOutputError,
  type Unvalidated,
  unvalidated,
  type Validated,
  validateLlmOutput,
} from "../src/index.ts";

/**
 * TK-50a : une sortie de modèle n'est jamais utilisable avant validation par l'appelant, et reste
 * une proposition ensuite (vision §6.3 : aucun ticket sans validation humaine).
 */
const parseCount = (raw: unknown): { count: number } => {
  if (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { count?: unknown }).count === "number"
  ) {
    return { count: (raw as { count: number }).count };
  }
  throw new Error("forme inattendue");
};

describe("validateLlmOutput", () => {
  it("rend une proposition validée quand parse réussit", () => {
    const result = validateLlmOutput(unvalidated({ count: 3 }), parseCount);
    expect(result.status).toBe("proposal");
    expect(result.value).toEqual({ count: 3 });
  });

  it("passe la valeur brute à parse, telle quelle", () => {
    const seen: unknown[] = [];
    validateLlmOutput(unvalidated("texte brut"), (raw) => {
      seen.push(raw);
      return raw;
    });
    expect(seen).toEqual(["texte brut"]);
  });

  it("rend la valeur produite par parse, pas la valeur brute", () => {
    const result = validateLlmOutput(unvalidated({ count: 3, extra: "x" }), parseCount);
    expect(result.value).toStrictEqual({ count: 3 });
  });

  it("lève LlmInvalidOutputError quand parse lève, sans reprendre la sortie", () => {
    const secret = "SORTIE-SENSIBLE-123";
    try {
      validateLlmOutput(unvalidated({ nope: secret }), parseCount);
      expect.unreachable("la validation devait échouer");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmInvalidOutputError);
      const e = error as LlmInvalidOutputError;
      expect(e.name).toBe("LlmInvalidOutputError");
      expect(e.message).not.toContain(secret);
      expect(e.reason).not.toContain(secret);
      expect(JSON.stringify(e)).not.toContain(secret);
    }
  });

  it("transforme aussi une valeur lancée qui n'est pas une Error", () => {
    const call = () =>
      validateLlmOutput(unvalidated("x"), () => {
        throw "échec brut";
      });
    expect(call).toThrow(LlmInvalidOutputError);
  });

  it("rend une proposition gelée", () => {
    expect(Object.isFrozen(validateLlmOutput(unvalidated({ count: 1 }), parseCount))).toBe(true);
  });
});

describe("Unvalidated / Validated : types", () => {
  it("une sortie non validée n'est pas assignable à Validated", () => {
    // @ts-expect-error seule validateLlmOutput produit un Validated
    const v: Validated<string> = unvalidated("x");
    expect(v).toBeDefined();
  });

  it("une valeur brute n'est pas assignable à Unvalidated", () => {
    // @ts-expect-error seul unvalidated() marque une sortie
    const u: Unvalidated<string> = "x";
    expect(u).toBeDefined();
  });

  it("aucune construction sauvage de Validated", () => {
    // @ts-expect-error l'objet de même forme n'est pas un Validated (marque)
    const v: Validated<string> = { status: "proposal", value: "x" };
    expect(v).toBeDefined();
  });

  it("une sortie non validée ne se lit pas comme sa valeur", () => {
    const u = unvalidated("texte");
    // @ts-expect-error aucune lecture directe de la valeur non validée
    const text: string = u;
    expect(text).toBeDefined();
  });

  it("le statut d'une sortie validée est une proposition, jamais une décision", () => {
    const result = validateLlmOutput(unvalidated(1), (raw) => Number(raw));
    const status: "proposal" = result.status;
    expect(status).toBe("proposal");
    // @ts-expect-error aucun autre statut n'existe
    const approved: "approved" = result.status;
    expect(approved).toBeDefined();
  });
});
