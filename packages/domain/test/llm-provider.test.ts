import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as domain from "../src/index.ts";
import {
  isLlmProviderId,
  isLlmServingProviderId,
  LLM_PROVIDER_IDS,
  LLM_TEST_PROVIDER_ID,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  llmCredential,
  type Validated,
  validateLlmOutput,
} from "../src/index.ts";
import { makeRequest } from "./llm-helpers.ts";
import { minimalProvider } from "./llm-provider.fake.ts";

/** TK-50b : forme du port, liste fermée des fournisseurs, exports publics, frontière. */
describe("LlmProvider : forme du port", () => {
  it("un faux minimal respecte le port et rend une réponse complète", async () => {
    const response = await minimalProvider.complete(makeRequest());
    expect(minimalProvider.id).toBe("fake");
    expect(response.stop).toBe("end");
    expect(response.usage).toEqual({ inputTokens: 1, outputTokens: 1 });
    expect(response.provider).toBe("fake");
    expect(response.model).toBe("claude-test-1");
  });

  it("la sortie d'une réponse est non fiable : seule validateLlmOutput la rend utilisable", async () => {
    const response = await minimalProvider.complete(makeRequest());
    // @ts-expect-error une sortie non validée n'est pas assignable à Validated
    const direct: Validated<string> = response.output;
    expect(direct).toBeDefined();
    const proposal = validateLlmOutput(response.output, (raw) => String(raw));
    expect(proposal.status).toBe("proposal");
    expect(proposal.value).toBe("ok");
  });

  it("refuse à la compilation une requête sans budget", () => {
    const { budget: _omitted, ...withoutBudget } = makeRequest();
    // @ts-expect-error le budget est obligatoire
    const request: LlmRequest = withoutBudget;
    expect(request).toBeDefined();
  });

  it("refuse à la compilation une requête sans trace, sans clé enveloppée ou avec un prompt brut", () => {
    const { trace: _t, ...noTrace } = makeRequest();
    // @ts-expect-error la trace est obligatoire
    const a: LlmRequest = noTrace;
    // @ts-expect-error la clé doit être une LlmCredential, pas une chaîne
    const b: LlmRequest = { ...makeRequest(), credential: "sk-brut" };
    // @ts-expect-error le prompt doit être un FramedPrompt, pas une chaîne
    const c: LlmRequest = { ...makeRequest(), prompt: "prompt brut" };
    // @ts-expect-error la sortie voulue est texte ou JSON avec schéma
    const d: LlmRequest = { ...makeRequest(), output: { kind: "json" } };
    expect([a, b, c, d]).toHaveLength(4);
    expect(llmCredential("k")).toBeDefined();
  });

  it("refuse à la compilation une réponse sans modèle servi ni usage", () => {
    // @ts-expect-error provider, model et usage sont obligatoires
    const bad: LlmResponse = { output: makeRequest(), stop: "end" };
    // @ts-expect-error un fournisseur hors liste fermée
    const unknown: LlmProvider = { id: "autre", complete: minimalProvider.complete };
    expect([bad, unknown]).toHaveLength(2);
  });
});

describe("fournisseurs : liste fermée", () => {
  it("fixe les fournisseurs BYOK, sans le faux", () => {
    expect([...LLM_PROVIDER_IDS]).toEqual(["anthropic", "openai", "google"]);
    expect(LLM_TEST_PROVIDER_ID).toBe("fake");
    expect(Object.isFrozen(LLM_PROVIDER_IDS) || Array.isArray(LLM_PROVIDER_IDS)).toBe(true);
  });

  it("isLlmProviderId : seulement la liste BYOK, casse exacte", () => {
    for (const id of LLM_PROVIDER_IDS) expect(isLlmProviderId(id)).toBe(true);
    for (const bad of [
      "fake",
      "Anthropic",
      "OPENAI",
      " google",
      "",
      "constructor",
      "__proto__",
      1,
      null,
      undefined,
    ]) {
      expect(isLlmProviderId(bad), String(bad)).toBe(false);
    }
  });

  it("isLlmServingProviderId : BYOK plus le faux", () => {
    for (const id of [...LLM_PROVIDER_IDS, "fake"]) expect(isLlmServingProviderId(id)).toBe(true);
    for (const bad of ["Fake", "mock", "", "toString", {}, null]) {
      expect(isLlmServingProviderId(bad), String(bad)).toBe(false);
    }
  });
});

describe("exports publics du port LLM", () => {
  it("exporte valeurs, classes et gardes de 50b", () => {
    for (const name of [
      "LLM_PROVIDER_IDS",
      "LLM_TEST_PROVIDER_ID",
      "isLlmProviderId",
      "isLlmServingProviderId",
      "LlmCredential",
      "llmCredential",
      "isLlmCredential",
      "revealLlmCredential",
      "LLM_CREDENTIAL_MAX_LENGTH",
      "LLM_MAX_OUTPUT_TOKENS",
      "LLM_MAX_TIMEOUT_MS",
      "LLM_MAX_PROMPT_CHARS",
      "LLM_MAX_COST_MICRO_USD",
      "assertWithinBudget",
      "assertLlmRequest",
      "LLM_STOP_REASONS",
      "LLM_TRACE_PATTERN",
      "LLM_MODEL_PATTERN",
      "LLM_BUDGET_LIMITS",
      "LLM_PROVIDER_ERROR_NAMES",
      "LlmProviderError",
      "LlmAuthError",
      "LlmRateLimitedError",
      "LlmQuotaExceededError",
      "LlmTimeoutError",
      "LlmAbortedError",
      "LlmBudgetExceededError",
      "LlmContextTooLongError",
      "LlmRefusedError",
      "LlmModelNotFoundError",
      "LlmProviderUnavailableError",
      "InvalidLlmCredentialError",
      "InvalidLlmRequestError",
      "InvalidLlmBudgetError",
      "isFramedPrompt",
      "isValidated",
      "isUntrustedOrigin",
    ]) {
      expect(domain, name).toHaveProperty(name);
    }
  });
});

describe("frontière : aucun fournisseur ni SDK dans le domaine", () => {
  const root = resolve(import.meta.dirname, "..");
  const srcDir = resolve(root, "src");
  const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
  const VENDOR = /anthropic|openai|gemini|@google|@ai-sdk|langchain/i;

  it("seul llm-provider-id.ts nomme un fournisseur", () => {
    expect(files).toContain("llm-provider.ts");
    for (const file of files.filter((f) => f !== "llm-provider-id.ts")) {
      expect(readFileSync(resolve(srcDir, file), "utf8"), file).not.toMatch(VENDOR);
    }
  });

  it("package.json n'a aucune dépendance d'exécution ni SDK LLM", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(JSON.stringify(pkg)).not.toMatch(VENDOR);
  });
});
