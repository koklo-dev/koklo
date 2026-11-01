import { describe, expect, it } from "vitest";
import {
  AGENT_BUDGET_LIMITS,
  AGENT_MAX_COST_MICRO_USD,
  AGENT_MAX_OUTPUT_CHARS,
  AGENT_MAX_PROMPT_CHARS,
  AGENT_MAX_TIMEOUT_MS,
  AgentBudgetExceededError,
  assertAgentBudget,
  assertSessionRequest,
  INVALID_AGENT_BUDGET_FIELDS,
  InvalidAgentBudgetError,
} from "../src/index.ts";
import { BUDGET, makePrompt, makeRequest, thrownBy } from "./agent-helpers.ts";

const FIELDS = ["timeoutMs", "maxCostMicroUsd", "maxOutputChars", "maxPromptChars"] as const;

describe("plafonds du domaine", () => {
  it("sont figes", () => {
    expect(AGENT_MAX_TIMEOUT_MS).toBe(3_600_000);
    expect(AGENT_MAX_COST_MICRO_USD).toBe(20_000_000);
    expect(AGENT_MAX_OUTPUT_CHARS).toBe(1_000_000);
    expect(AGENT_MAX_PROMPT_CHARS).toBe(1_000_000);
  });

  it("listes fermees des champs et des limites", () => {
    expect([...INVALID_AGENT_BUDGET_FIELDS]).toEqual([
      "budget",
      "timeoutMs",
      "maxCostMicroUsd",
      "maxOutputChars",
      "maxPromptChars",
    ]);
    expect([...AGENT_BUDGET_LIMITS]).toEqual(["timeout", "cost", "output-chars", "prompt-chars"]);
  });

  it("le budget de reference des tests respecte les plafonds", () => {
    expect(() => assertAgentBudget(BUDGET, makePrompt())).not.toThrow();
  });
});

describe("assertAgentBudget : forme", () => {
  const invalid = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, "10", null, undefined, {}];
  for (const field of FIELDS) {
    it.each(invalid)(`refuse ${field} = %j`, (value) => {
      const error = thrownBy(() => assertAgentBudget({ ...BUDGET, [field]: value }, makePrompt()));
      expect(error).toBeInstanceOf(InvalidAgentBudgetError);
      expect((error as InvalidAgentBudgetError).field).toBe(field);
    });
  }

  it.each([undefined, null, 5, "budget"])("refuse un budget %j", (budget) => {
    const error = thrownBy(() => assertAgentBudget(budget as never, makePrompt()));
    expect(error).toMatchObject({ name: "InvalidAgentBudgetError", field: "budget" });
  });

  it("refuse un champ manquant", () => {
    const { timeoutMs: _omitted, ...rest } = BUDGET;
    const error = thrownBy(() => assertAgentBudget(rest as never, makePrompt()));
    expect(error).toMatchObject({ field: "timeoutMs" });
  });
});

describe("assertAgentBudget : plafonds et taille du prompt", () => {
  const ceilings = [
    ["timeoutMs", AGENT_MAX_TIMEOUT_MS, "timeout"],
    ["maxCostMicroUsd", AGENT_MAX_COST_MICRO_USD, "cost"],
    ["maxOutputChars", AGENT_MAX_OUTPUT_CHARS, "output-chars"],
    ["maxPromptChars", AGENT_MAX_PROMPT_CHARS, "prompt-chars"],
  ] as const;
  for (const [field, ceiling, limit] of ceilings) {
    it(`accepte ${field} au plafond, refuse au-dessus (${limit})`, () => {
      expect(() => assertAgentBudget({ ...BUDGET, [field]: ceiling }, makePrompt())).not.toThrow();
      const error = thrownBy(() =>
        assertAgentBudget({ ...BUDGET, [field]: ceiling + 1 }, makePrompt()),
      );
      expect(error).toBeInstanceOf(AgentBudgetExceededError);
      expect((error as AgentBudgetExceededError).limit).toBe(limit);
    });
  }

  it("refuse un prompt plus long que maxPromptChars", () => {
    const prompt = makePrompt();
    const size = prompt.system.length + prompt.user.length;
    expect(() => assertAgentBudget({ ...BUDGET, maxPromptChars: size }, prompt)).not.toThrow();
    const error = thrownBy(() =>
      assertAgentBudget({ ...BUDGET, maxPromptChars: size - 1 }, prompt),
    );
    expect(error).toMatchObject({ name: "AgentBudgetExceededError", limit: "prompt-chars" });
  });

  it("est appliquee par la garde de requete", () => {
    const error = thrownBy(() =>
      assertSessionRequest(
        makeRequest({ budget: { ...BUDGET, timeoutMs: AGENT_MAX_TIMEOUT_MS + 1 } }),
      ),
    );
    expect(error).toBeInstanceOf(AgentBudgetExceededError);
    const bad = thrownBy(() =>
      assertSessionRequest(makeRequest({ budget: { ...BUDGET, maxOutputChars: Number.NaN } })),
    );
    expect(bad).toBeInstanceOf(InvalidAgentBudgetError);
  });
});
