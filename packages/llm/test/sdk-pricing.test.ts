import { LLM_PROVIDER_IDS } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { actualCostMicroUsd, costUpperBoundFor, priceFor } from "../src/index.ts";

describe("tarifs par fournisseur", () => {
  it("Anthropic : la table existante fait foi", () => {
    expect(priceFor("anthropic", "claude-sonnet-5-5")).toEqual({
      inputUsdPerMTok: 2,
      outputUsdPerMTok: 10,
    });
  });

  it.each(["openai", "google", "mistral", "openrouter"] as const)(
    "%s : modèle inconnu = pire tarif connu, jamais 0",
    (id) => {
      const price = priceFor(id, "modele-inconnu");
      expect(price.inputUsdPerMTok).toBeGreaterThan(0);
      expect(price.outputUsdPerMTok).toBeGreaterThan(0);
      expect(costUpperBoundFor(id, "modele-inconnu", 1000, 100)).toBeGreaterThan(0);
    },
  );

  it("openai_compatible : tarif nul (le prix est saisi par l'organisation, B48)", () => {
    expect(priceFor("openai_compatible", "x")).toEqual({ inputUsdPerMTok: 0, outputUsdPerMTok: 0 });
    expect(
      actualCostMicroUsd("openai_compatible", "x", { inputTokens: 5e6, outputTokens: 5e6 }),
    ).toBe(0);
  });

  it("coût réel = tarif x jetons réels, en micro-dollars entiers (arrondi au-dessus)", () => {
    expect(
      actualCostMicroUsd("anthropic", "claude-sonnet-5-5", {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      }),
    ).toBe(2_000_000 + 5_000_000);
    expect(
      actualCostMicroUsd("anthropic", "claude-sonnet-5-5", { inputTokens: 1, outputTokens: 1 }),
    ).toBe(12);
    expect(
      Number.isInteger(actualCostMicroUsd("openai", "x", { inputTokens: 7, outputTokens: 3 })),
    ).toBe(true);
  });

  it("aucun fournisseur sans règle de prix", () => {
    for (const id of LLM_PROVIDER_IDS) {
      expect(() => priceFor(id, "m")).not.toThrow();
    }
  });

  it("lecture sans passer par le prototype", () => {
    expect(priceFor("anthropic", "__proto__")).toEqual(priceFor("anthropic", "inconnu-9"));
  });
});
