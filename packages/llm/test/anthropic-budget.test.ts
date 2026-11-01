import { InvalidLlmBudgetError, LlmBudgetExceededError } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_PRICES,
  costUpperBoundMicroUsd,
  priceOf,
} from "../src/index.ts";
import { BUDGET, bench, makeRequest, PROMPT, rejection } from "./support/harness.ts";

const PROMPT_CHARS = PROMPT.system.length + PROMPT.user.length;
const UNKNOWN = "claude-modele-inconnu-9";

describe("table de prix", () => {
  const prices = Object.values(ANTHROPIC_PRICES);

  it("contient le modèle par défaut et des prix finis et positifs", () => {
    expect(ANTHROPIC_PRICES).toHaveProperty([ANTHROPIC_DEFAULT_MODEL]);
    expect(prices.length).toBeGreaterThan(0);
    for (const { inputUsdPerMTok, outputUsdPerMTok } of prices) {
      expect(Number.isFinite(inputUsdPerMTok) && inputUsdPerMTok > 0).toBe(true);
      expect(Number.isFinite(outputUsdPerMTok) && outputUsdPerMTok > 0).toBe(true);
    }
  });

  it("un modèle connu a son prix", () => {
    expect(priceOf(ANTHROPIC_DEFAULT_MODEL)).toEqual(ANTHROPIC_PRICES[ANTHROPIC_DEFAULT_MODEL]);
  });

  it("un modèle inconnu prend le tarif le plus élevé, composante par composante", () => {
    expect(priceOf(UNKNOWN)).toEqual({
      inputUsdPerMTok: Math.max(...prices.map((p) => p.inputUsdPerMTok)),
      outputUsdPerMTok: Math.max(...prices.map((p) => p.outputUsdPerMTok)),
    });
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "%s n'est pas un modèle connu (pas de lecture par le prototype)",
    (name) => {
      expect(priceOf(name)).toEqual(priceOf(UNKNOWN));
    },
  );
});

describe("majorant de coût", () => {
  it("vaut caractères x prix d'entrée + tokens de sortie x prix de sortie, arrondi au-dessus", () => {
    const { inputUsdPerMTok, outputUsdPerMTok } = priceOf(UNKNOWN);
    const expected = Math.ceil(PROMPT_CHARS * inputUsdPerMTok + 1_000 * outputUsdPerMTok);
    expect(costUpperBoundMicroUsd(UNKNOWN, PROMPT_CHARS, 1_000)).toBe(expected);
  });

  it("est monotone en caractères et en tokens de sortie", () => {
    expect(costUpperBoundMicroUsd(UNKNOWN, 200, 100)).toBeGreaterThan(
      costUpperBoundMicroUsd(UNKNOWN, 100, 100),
    );
    expect(costUpperBoundMicroUsd(UNKNOWN, 100, 200)).toBeGreaterThan(
      costUpperBoundMicroUsd(UNKNOWN, 100, 100),
    );
  });
});

describe("budget : refus avant l'appel", () => {
  const withCost = (maxCostMicroUsd: number) => ({ ...BUDGET, maxCostMicroUsd });
  const bound = costUpperBoundMicroUsd(UNKNOWN, PROMPT_CHARS, BUDGET.maxOutputTokens);

  it("majorant au-dessus du plafond : LlmBudgetExceededError{cost}, aucun appel", async () => {
    const { transport, provider } = bench();
    const request = makeRequest({ model: UNKNOWN, budget: withCost(bound - 1) });
    const error = await rejection(provider.complete(request));
    expect(error).toBeInstanceOf(LlmBudgetExceededError);
    expect((error as LlmBudgetExceededError).limit).toBe("cost");
    expect(transport.calls()).toBe(0);
  });

  it("majorant égal au plafond : l'appel part", async () => {
    const { transport, provider } = bench();
    transport.enqueue({ kind: "message", text: "ok" });
    await provider.complete(makeRequest({ model: UNKNOWN, budget: withCost(bound) }));
    expect(transport.calls()).toBe(1);
  });

  it("un modèle inconnu est facturé au pire tarif : un plafond juste pour un modèle connu le refuse", async () => {
    const known = costUpperBoundMicroUsd(
      ANTHROPIC_DEFAULT_MODEL,
      PROMPT_CHARS,
      BUDGET.maxOutputTokens,
    );
    if (known === bound) return; // table à tarif unique : rien à distinguer
    const { transport, provider } = bench();
    const request = makeRequest({ model: UNKNOWN, budget: withCost(known) });
    expect(await rejection(provider.complete(request))).toBeInstanceOf(LlmBudgetExceededError);
    expect(transport.calls()).toBe(0);
  });

  it("budget invalide ou au-dessus des plafonds du domaine : refus avant l'appel", async () => {
    const { transport, provider } = bench();
    const invalid = { ...BUDGET, timeoutMs: 0 };
    expect(await rejection(provider.complete(makeRequest({ budget: invalid })))).toBeInstanceOf(
      InvalidLlmBudgetError,
    );
    const over = { ...BUDGET, maxOutputTokens: 10 ** 6 };
    expect(await rejection(provider.complete(makeRequest({ budget: over })))).toBeInstanceOf(
      LlmBudgetExceededError,
    );
    expect(transport.calls()).toBe(0);
  });

  it("la garde du domaine passe avant le coût : prompt trop long -> prompt-chars", async () => {
    const { transport, provider } = bench();
    const budget = { ...BUDGET, maxPromptChars: PROMPT_CHARS - 1 };
    const error = await rejection(provider.complete(makeRequest({ budget })));
    expect((error as LlmBudgetExceededError).limit).toBe("prompt-chars");
    expect(transport.calls()).toBe(0);
  });
});
