import { AI_MODEL_PATTERN, aiUsageSchema, llmProviderSchema } from "@koklo/contract";
import { AI_USAGES, LLM_MODEL_PATTERN, LLM_PROVIDER_IDS } from "@koklo/domain";
import { describe, expect, it } from "vitest";

/** TK-98 : le contrat (qui n'importe pas le domaine) reproduit ses listes et sa règle de modèle à l'identique. */
describe("contrat 2.3.0 / domaine : parité", () => {
  it("usages et fournisseurs sont ceux du domaine", () => {
    expect([...aiUsageSchema.options]).toEqual([...AI_USAGES]);
    expect([...llmProviderSchema.options]).toEqual([...LLM_PROVIDER_IDS]);
  });

  it("la règle de modèle est celle de LLM_MODEL_PATTERN", () => {
    expect(AI_MODEL_PATTERN.source).toBe(LLM_MODEL_PATTERN.source);
    expect(AI_MODEL_PATTERN.flags).toBe(LLM_MODEL_PATTERN.flags);
  });
});
