import { describe, expect, it } from "vitest";
import {
  AI_COST_EUR_PER_USD,
  eurosToMicroUsd,
  formatEuros,
  parseCapEuros,
} from "../src/lib/ai-cost.ts";

/** Conversion dollars -> euros (B126 : 1 USD = 1 EUR, estimation) et saisie du plafond (A1, B62). */
const norm = (text: string) => text.replace(/\s/g, " ");

describe("ai-cost", () => {
  it("1 USD = 1 EUR", () => expect(AI_COST_EUR_PER_USD).toBe(1));
  it("formatEuros : deux décimales, virgule française", () => {
    expect(norm(formatEuros(12_400_000))).toBe("12,40 €");
    expect(norm(formatEuros(0))).toBe("0,00 €");
  });
  it("eurosToMicroUsd", () => {
    expect(eurosToMicroUsd(25.5)).toBe(25_500_000);
    expect(eurosToMicroUsd(0.000001)).toBe(1);
  });
  it("parseCapEuros : virgule ou point, vide = retrait, le reste invalide", () => {
    expect(parseCapEuros("25,5")).toEqual({ ok: true, microUsd: 25_500_000 });
    expect(parseCapEuros(" 10 ")).toEqual({ ok: true, microUsd: 10_000_000 });
    expect(parseCapEuros("")).toEqual({ ok: true, microUsd: null });
    for (const bad of ["0", "-3", "abc", "1e400", "0,0000001"]) {
      expect(parseCapEuros(bad), bad).toEqual({ ok: false });
    }
  });
});
