import { describe, expect, it } from "vitest";
import {
  assertLlmRequest,
  INVALID_LLM_REQUEST_REASONS,
  InvalidLlmRequestError,
  LLM_MODEL_PATTERN,
  LLM_STOP_REASONS,
  LLM_TRACE_PATTERN,
  LlmAbortedError,
  LlmBudgetExceededError,
  type LlmRequest,
} from "../src/index.ts";
import { BUDGET, makeRequest, PROMPT_TEXT, SECRET_KEY } from "./llm-helpers.ts";

/**
 * TK-50b : `assertLlmRequest` est la garde unique d'un adaptateur avant tout appel réseau. Ordre :
 * forme (model, credential, prompt, output, temperature, signal, trace) -> budget -> annulation.
 */
const reasonOf = (request: unknown): string => {
  try {
    assertLlmRequest(request as LlmRequest);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidLlmRequestError);
    return (error as InvalidLlmRequestError).reason;
  }
  return "ok";
};
const forge = (overrides: Record<string, unknown>) => ({ ...makeRequest(), ...overrides });

describe("constantes du port", () => {
  it("fixe la liste fermée des raisons d'arrêt", () => {
    expect([...LLM_STOP_REASONS]).toEqual(["end", "max-tokens", "stop-sequence", "refusal"]);
  });

  it("fixe la liste fermée des raisons de requête invalide", () => {
    expect([...INVALID_LLM_REQUEST_REASONS]).toEqual([
      "model",
      "credential",
      "prompt",
      "output",
      "temperature",
      "signal",
      "trace",
    ]);
  });
});

describe("assertLlmRequest : requête valide", () => {
  it("accepte une requête texte, JSON, avec température et signal", () => {
    expect(reasonOf(makeRequest())).toBe("ok");
    expect(reasonOf(makeRequest({ output: { kind: "json", schema: { type: "object" } } }))).toBe(
      "ok",
    );
    expect(reasonOf(makeRequest({ temperature: 0 }))).toBe("ok");
    expect(reasonOf(makeRequest({ temperature: 2 }))).toBe("ok");
    expect(reasonOf(makeRequest({ signal: new AbortController().signal }))).toBe("ok");
  });
});

describe("assertLlmRequest : garde de forme", () => {
  it("refuse un prompt qui n'est pas un FramedPrompt (chaîne, objet de même forme)", () => {
    expect(reasonOf(forge({ prompt: "system+user concaténés" }))).toBe("prompt");
    expect(reasonOf(forge({ prompt: { system: "s", user: PROMPT_TEXT } }))).toBe("prompt");
    expect(reasonOf(forge({ prompt: undefined }))).toBe("prompt");
  });

  it("refuse une clé qui n'est pas une LlmCredential", () => {
    expect(reasonOf(forge({ credential: SECRET_KEY }))).toBe("credential");
    expect(reasonOf(forge({ credential: { reveal: () => SECRET_KEY } }))).toBe("credential");
    expect(reasonOf(forge({ credential: undefined }))).toBe("credential");
  });

  it("refuse un modèle vide, trop long ou hors alphabet", () => {
    expect(LLM_MODEL_PATTERN.test("claude-sonnet-4.5")).toBe(true);
    for (const model of ["", " ", "a b", "x".repeat(129), "m\nodel", 5, undefined]) {
      expect(reasonOf(forge({ model }))).toBe("model");
    }
    expect(reasonOf(forge({ model: "x".repeat(128) }))).toBe("ok");
  });

  it("refuse une sortie voulue inconnue ou un schéma qui n'est pas un objet", () => {
    for (const output of [
      undefined,
      { kind: "xml" },
      { kind: "json" },
      { kind: "json", schema: "string" },
      { kind: "json", schema: [] },
      { kind: "json", schema: null },
    ]) {
      expect(reasonOf(forge({ output }))).toBe("output");
    }
  });

  it("borne la température à [0, 2] et refuse les valeurs non finies", () => {
    for (const temperature of [-0.1, 2.1, Number.NaN, Number.POSITIVE_INFINITY, "0.5"]) {
      expect(reasonOf(forge({ temperature }))).toBe("temperature");
    }
  });

  it("refuse un signal qui n'est pas un AbortSignal", () => {
    expect(reasonOf(forge({ signal: {} }))).toBe("signal");
    expect(reasonOf(forge({ signal: true }))).toBe("signal");
  });
});

describe("assertLlmRequest : trace sans contenu", () => {
  it("fixe le motif de trace", () => {
    expect(LLM_TRACE_PATTERN.test("brief-to-features")).toBe(true);
    expect(LLM_TRACE_PATTERN.test(PROMPT_TEXT)).toBe(false);
  });

  it("refuse un purpose ou un correlationId qui ressemble à du contenu", () => {
    const base = { purpose: "brief", correlationId: "req-1" };
    for (const trace of [
      { ...base, purpose: PROMPT_TEXT },
      { ...base, correlationId: "avec espace" },
      { ...base, purpose: "" },
      { ...base, correlationId: "x".repeat(65) },
      { ...base, purpose: "a\nb" },
      { ...base, correlationId: SECRET_KEY + " suite" },
      { purpose: "brief" },
      undefined,
    ]) {
      expect(reasonOf(forge({ trace }))).toBe("trace");
    }
    expect(
      reasonOf(forge({ trace: { purpose: "p".repeat(64), correlationId: "c".repeat(64) } })),
    ).toBe("ok");
  });

  it("l'erreur ne reprend ni le contenu de la trace, ni le prompt, ni la clé", () => {
    try {
      assertLlmRequest(forge({ trace: { purpose: PROMPT_TEXT, correlationId: "r" } }));
      expect.unreachable("la trace devait être refusée");
    } catch (error) {
      const e = error as InvalidLlmRequestError;
      const dump = JSON.stringify(e) + e.message + (e.stack ?? "");
      expect(dump).not.toContain("SENTINELLE");
      expect("cause" in e).toBe(false);
    }
  });
});

describe("assertLlmRequest : budget et annulation", () => {
  it("applique le budget avant tout appel", () => {
    expect(() =>
      assertLlmRequest(makeRequest({ budget: { ...BUDGET, maxPromptChars: 1 } })),
    ).toThrow(LlmBudgetExceededError);
  });

  it("lève LlmAbortedError quand le signal est déjà annulé", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => assertLlmRequest(makeRequest({ signal: controller.signal }))).toThrow(
      LlmAbortedError,
    );
  });

  it("la forme invalide l'emporte sur le budget, le budget sur l'annulation", () => {
    const controller = new AbortController();
    controller.abort();
    const badBudget = { ...BUDGET, maxPromptChars: 1 };
    expect(reasonOf(forge({ model: "", budget: badBudget, signal: controller.signal }))).toBe(
      "model",
    );
    expect(() =>
      assertLlmRequest(makeRequest({ budget: badBudget, signal: controller.signal })),
    ).toThrow(LlmBudgetExceededError);
  });
});
