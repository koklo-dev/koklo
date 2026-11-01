import { describe, expect, it } from "vitest";
import {
  assertWithinBudget,
  InvalidLlmBudgetError,
  LLM_BUDGET_LIMITS,
  LLM_MAX_COST_MICRO_USD,
  LLM_MAX_OUTPUT_TOKENS,
  LLM_MAX_PROMPT_CHARS,
  LLM_MAX_TIMEOUT_MS,
  type LlmBudget,
  LlmBudgetExceededError,
} from "../src/index.ts";
import { BUDGET, makePrompt } from "./llm-helpers.ts";

/**
 * TK-50b : le budget est obligatoire (tokens, durée, coût, taille de prompt), plafonné par le
 * domaine, et vérifié par `assertWithinBudget` avant tout appel réseau. Égal passe, +1 est refusé.
 * Longueur du prompt = `system.length + user.length`.
 */
const promptOfLength = (length: number) => {
  const base = makePrompt("");
  const filler = "x".repeat(Math.max(0, length - base.system.length - base.user.length - 1));
  return makePrompt(filler);
};

const check = (budget: unknown, prompt = makePrompt()) =>
  assertWithinBudget({ prompt, budget: budget as LlmBudget });

const limitOf = (budget: unknown, prompt = makePrompt()): string => {
  try {
    check(budget, prompt);
  } catch (error) {
    expect(error).toBeInstanceOf(LlmBudgetExceededError);
    return (error as LlmBudgetExceededError).limit;
  }
  return "ok";
};

describe("plafonds du domaine", () => {
  it("fixe les plafonds", () => {
    expect(LLM_MAX_OUTPUT_TOKENS).toBe(32_000);
    expect(LLM_MAX_TIMEOUT_MS).toBe(120_000);
    expect(LLM_MAX_PROMPT_CHARS).toBe(400_000);
    expect(LLM_MAX_COST_MICRO_USD).toBe(5_000_000);
  });

  it("expose la liste fermée des limites", () => {
    expect([...LLM_BUDGET_LIMITS]).toEqual(["output-tokens", "timeout", "cost", "prompt-chars"]);
  });
});

describe("assertWithinBudget : bornes", () => {
  it("accepte un budget courant", () => {
    expect(() => check(BUDGET)).not.toThrow();
  });

  it("accepte les plafonds exacts", () => {
    const max = {
      maxOutputTokens: LLM_MAX_OUTPUT_TOKENS,
      timeoutMs: LLM_MAX_TIMEOUT_MS,
      maxPromptChars: LLM_MAX_PROMPT_CHARS,
      maxCostMicroUsd: LLM_MAX_COST_MICRO_USD,
    };
    expect(limitOf(max)).toBe("ok");
  });

  it.each([
    ["maxOutputTokens", LLM_MAX_OUTPUT_TOKENS, "output-tokens"],
    ["timeoutMs", LLM_MAX_TIMEOUT_MS, "timeout"],
    ["maxPromptChars", LLM_MAX_PROMPT_CHARS, "prompt-chars"],
    ["maxCostMicroUsd", LLM_MAX_COST_MICRO_USD, "cost"],
  ])("refuse %s au-dessus du plafond (+1)", (field, ceiling, limit) => {
    expect(limitOf({ ...BUDGET, [field]: ceiling + 1 })).toBe(limit);
  });

  it("accepte un prompt de la longueur exacte du budget, refuse +1", () => {
    const prompt = promptOfLength(2_000);
    const length = prompt.system.length + prompt.user.length;
    expect(limitOf({ ...BUDGET, maxPromptChars: length }, prompt)).toBe("ok");
    expect(limitOf({ ...BUDGET, maxPromptChars: length - 1 }, prompt)).toBe("prompt-chars");
  });

  it("l'erreur de dépassement ne reprend ni le prompt ni les valeurs", () => {
    try {
      check({ ...BUDGET, maxPromptChars: 1 });
      expect.unreachable("le budget devait être dépassé");
    } catch (error) {
      const e = error as LlmBudgetExceededError;
      expect(e.operation).toBe("complete");
      expect(JSON.stringify(e) + e.message + (e.stack ?? "")).not.toContain("SENTINELLE");
    }
  });
});

describe("assertWithinBudget : budget invalide", () => {
  const fieldOf = (budget: unknown): string => {
    try {
      check(budget);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidLlmBudgetError);
      return (error as InvalidLlmBudgetError).field;
    }
    return "ok";
  };

  it("refuse un budget absent", () => {
    expect(fieldOf(undefined)).toBe("budget");
    expect(fieldOf(null)).toBe("budget");
    expect(fieldOf({})).toBe("maxOutputTokens");
  });

  it.each(["maxOutputTokens", "timeoutMs", "maxPromptChars", "maxCostMicroUsd"])(
    "refuse %s absent, nul, négatif, non entier ou non fini",
    (field) => {
      const without = { ...BUDGET } as Record<string, unknown>;
      delete without[field];
      expect(fieldOf(without)).toBe(field);
      for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "10", null]) {
        expect(fieldOf({ ...BUDGET, [field]: bad })).toBe(field);
      }
    },
  );
});
