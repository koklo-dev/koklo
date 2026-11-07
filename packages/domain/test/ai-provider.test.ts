import { describe, expect, it } from "vitest";
import {
  AI_USAGES,
  type AiProvider,
  type AiRequest,
  isAiUsage,
  isLlmProviderId,
  LLM_PROVIDER_IDS,
  LLM_PROVIDER_TRAITS,
  type LlmStreamEvent,
  llmProviderTraits,
} from "../src/index.ts";

describe("TK-95 · identifiants de fournisseur", () => {
  it("liste fermée de six fournisseurs", () => {
    expect([...LLM_PROVIDER_IDS]).toEqual([
      "anthropic",
      "openai",
      "google",
      "mistral",
      "openrouter",
      "openai_compatible",
    ]);
  });

  it.each(["mistral", "openrouter", "openai_compatible"])("reconnaît %s", (id) => {
    expect(isLlmProviderId(id)).toBe(true);
  });

  it.each(["fake", "constructor", "__proto__", "OpenAI", ""])("refuse %j", (id) => {
    expect(isLlmProviderId(id)).toBe(false);
  });
});

describe("TK-95 · usages d'IA", () => {
  it("quatre usages fermés", () => {
    expect([...AI_USAGES]).toEqual([
      "idea_space",
      "spec_deliverables",
      "baseline_summary",
      "ticket_breakdown",
    ]);
  });

  it("isAiUsage refuse tout le reste, prototype compris", () => {
    expect(isAiUsage("idea_space")).toBe(true);
    for (const value of ["verify", "constructor", "__proto__", undefined, 3, null]) {
      expect(isAiUsage(value)).toBe(false);
    }
  });
});

describe("TK-95 · traits des fournisseurs", () => {
  it("une entrée par fournisseur, gelée", () => {
    expect(Object.keys(LLM_PROVIDER_TRAITS).sort()).toEqual([...LLM_PROVIDER_IDS].sort());
    expect(Object.isFrozen(LLM_PROVIDER_TRAITS)).toBe(true);
    for (const id of LLM_PROVIDER_IDS) {
      expect(Object.isFrozen(llmProviderTraits(id))).toBe(true);
    }
  });

  it("OpenRouter seul est un intermédiaire et seul il est écarté en mode UE (A5, lecture prudente)", () => {
    for (const id of LLM_PROVIDER_IDS) {
      expect(llmProviderTraits(id).intermediary, id).toBe(id === "openrouter");
      expect(llmProviderTraits(id).euEligible, id).toBe(id !== "openrouter");
    }
  });

  it("seul le point d'accès compatible exige une adresse de base", () => {
    for (const id of LLM_PROVIDER_IDS) {
      expect(llmProviderTraits(id).baseUrlRequired, id).toBe(id === "openai_compatible");
    }
  });
});

describe("TK-95 · forme du port AiProvider", () => {
  it("un appelant donne un usage, jamais un fournisseur ni un modèle", () => {
    const provider: AiProvider = {
      complete: async () => {
        throw new Error("non utilisé");
      },
      stream: async function* (): AsyncGenerator<LlmStreamEvent> {},
      preflight: async () => {},
    };
    // @ts-expect-error une requête d'usage n'a pas de champ `provider`
    const bad: AiRequest = { provider: "anthropic" };
    expect(typeof provider.stream).toBe("function");
    expect(bad).toBeDefined();
  });
});

describe("TK-95 · baseUrl dans la requête", () => {
  it("accepte une chaîne de 2048 caractères au plus, refuse le reste avec la raison baseUrl", async () => {
    const { assertLlmRequest } = await import("../src/index.ts");
    const { makeRequest } = await import("./llm-helpers.ts");
    expect(assertLlmRequest(makeRequest({ baseUrl: "https://llm.exemple.test/v1" })).baseUrl).toBe(
      "https://llm.exemple.test/v1",
    );
    expect(assertLlmRequest(makeRequest()).baseUrl).toBeUndefined();
    for (const baseUrl of [3, "", "x".repeat(2049), {}] as unknown[]) {
      expect(() => assertLlmRequest(makeRequest({ baseUrl: baseUrl as string }))).toThrow(
        expect.objectContaining({ name: "InvalidLlmRequestError", reason: "baseUrl" }),
      );
    }
  });
});

describe("TK-95 · modèle « fournisseur/modèle » des intermédiaires", () => {
  it("accepte un seul / entre deux segments, refuse les chemins", async () => {
    const { LLM_MODEL_PATTERN } = await import("../src/index.ts");
    for (const ok of ["anthropic/claude-sonnet-5-5", "meta-llama/llama-3.1:free", "gpt-x"]) {
      expect(LLM_MODEL_PATTERN.test(ok), ok).toBe(true);
    }
    for (const bad of ["/x", "x/", "a/b/c", "../x", "a/../b", "a//b", ""]) {
      expect(LLM_MODEL_PATTERN.test(bad), bad).toBe(false);
    }
  });
});
