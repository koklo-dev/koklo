import {
  LLM_MAX_COST_MICRO_USD,
  LLM_MAX_OUTPUT_TOKENS,
  LLM_MAX_PROMPT_CHARS,
  LLM_MAX_TIMEOUT_MS,
} from "@koklo/domain";
import { describe, expect, it } from "vitest";
import { PROPOSAL_BUDGETS } from "../src/index.ts";

describe("PROPOSAL_BUDGETS (TK-99a lot B)", () => {
  it("couvre les trois motifs de la génération de propositions", () => {
    expect(Object.keys(PROPOSAL_BUDGETS).sort()).toEqual([
      "proposal-batch",
      "proposal-revise",
      "proposal-zones",
    ]);
  });

  it("reste sous les plafonds du domaine et laisse plus de sortie à une zone qu'à la liste des zones", () => {
    for (const budget of Object.values(PROPOSAL_BUDGETS)) {
      expect(budget.maxOutputTokens).toBeLessThanOrEqual(LLM_MAX_OUTPUT_TOKENS);
      expect(budget.timeoutMs).toBeLessThanOrEqual(LLM_MAX_TIMEOUT_MS);
      expect(budget.maxPromptChars).toBeLessThanOrEqual(LLM_MAX_PROMPT_CHARS);
      expect(budget.maxCostMicroUsd).toBeLessThanOrEqual(LLM_MAX_COST_MICRO_USD);
    }
    expect(PROPOSAL_BUDGETS["proposal-batch"].maxOutputTokens).toBeGreaterThan(
      PROPOSAL_BUDGETS["proposal-zones"].maxOutputTokens,
    );
  });
});
