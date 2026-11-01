import { describe, expect, it } from "vitest";
import {
  LlmContextTooLongError,
  LlmModelNotFoundError,
  type LlmProvider,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmRefusedError,
  type LlmRequest,
  LlmTimeoutError,
  revealLlmCredential,
} from "../src/index.ts";
import {
  FakeLlm,
  LLM_CONFORMANCE_CASE_NAMES,
  LLM_FAILURE_TRIGGERS,
  type LlmConformanceFactory,
  LlmConformanceFailure,
  type LlmConformanceSubject,
  llmConformanceCases,
  runLlmConformance,
} from "../src/testing/index.ts";
import { SECRET_KEY } from "./llm-helpers.ts";

const OP = { operation: "complete" } as const;
const ERRORS = {
  "rate-limited": () => new LlmRateLimitedError({ ...OP, retryAfterMs: 10 ** 12 }),
  timeout: () => new LlmTimeoutError(OP),
  unavailable: () => new LlmProviderUnavailableError(OP),
  refused: () => new LlmRefusedError(OP),
  quota: () => new LlmQuotaExceededError(OP),
  "model-not-found": () => new LlmModelNotFoundError(OP),
  "context-too-long": () => new LlmContextTooLongError(OP),
};

/** Sujet de conformité adossé à FakeLlm : le faux est le premier client de la suite. */
const fakeSubject = (): LlmConformanceSubject => {
  let fake = new FakeLlm({ rejectedKeys: ["sk-refusee-0001"], servedModel: "fake-served-1" });
  let armed:
    | { kind: "reply"; output: unknown }
    | { kind: "fail"; trigger: keyof typeof ERRORS }
    | undefined;
  const provider: LlmProvider = {
    id: "fake",
    complete: (request: LlmRequest) => {
      const current = armed;
      armed = undefined;
      const options = { rejectedKeys: ["sk-refusee-0001"], servedModel: "fake-served-1" };
      if (current?.kind === "fail") {
        fake = FakeLlm.failing(ERRORS[current.trigger](), options);
      } else {
        fake = FakeLlm.replying(current?.kind === "reply" ? current.output : "réponse", options);
      }
      return fake.complete(request);
    },
  };
  let made = 0;
  const counting: LlmProvider = {
    id: "fake",
    complete: async (request) => {
      const before = fake.calls.length;
      try {
        return await provider.complete(request);
      } finally {
        made += fake.calls.length > before ? 1 : 0;
      }
    },
  };
  return {
    provider: counting,
    validKey: SECRET_KEY,
    invalidKey: "sk-refusee-0001",
    servedModel: "fake-served-1",
    replyWith: (output) => {
      armed = { kind: "reply", output };
    },
    failWith: (trigger) => {
      armed = { kind: "fail", trigger };
    },
    callsMade: () => made,
  };
};

// La suite partagée s'exécute sur le faux ; TK-54 l'exécutera sur l'adaptateur.
runLlmConformance("FakeLlm", () => fakeSubject(), { describe, it });

describe("suite de conformité : forme", () => {
  it("expose la liste fermée de cas et de déclencheurs, sans doublon", () => {
    expect(new Set(LLM_CONFORMANCE_CASE_NAMES).size).toBe(LLM_CONFORMANCE_CASE_NAMES.length);
    expect(llmConformanceCases().map((c) => c.name)).toEqual([...LLM_CONFORMANCE_CASE_NAMES]);
    expect([...LLM_FAILURE_TRIGGERS].sort()).toEqual(Object.keys(ERRORS).sort());
  });
});

const failureOf = async (name: string, factory: LlmConformanceFactory): Promise<unknown> => {
  const testCase = llmConformanceCases().find((c) => c.name === name);
  return testCase?.run(factory).then(
    () => undefined,
    (error: unknown) => error,
  );
};

/** Sujet défectueux : dérive du bon sujet en remplaçant le fournisseur. */
const broken =
  (
    wrap: (inner: LlmProvider, subject: LlmConformanceSubject) => LlmProvider,
  ): LlmConformanceFactory =>
  () => {
    const subject = fakeSubject();
    return { ...subject, provider: wrap(subject.provider, subject) };
  };

describe("suite de conformité : bon sujet", () => {
  it("passe chaque cas sur un bon sujet", async () => {
    for (const name of LLM_CONFORMANCE_CASE_NAMES) {
      expect(await failureOf(name, () => fakeSubject()), name).toBeUndefined();
    }
  });
});

describe("suite de conformité : détecte les adaptateurs défectueux", () => {
  it("détecte une clé divulguée dans le message d'une erreur", async () => {
    const leaky = broken((inner) => ({
      id: "fake",
      complete: (request) =>
        inner.complete(request).catch((error: Error) => {
          error.message = `échec avec ${revealLlmCredential(request.credential)}`;
          throw error;
        }),
    }));
    expect(await failureOf("never leaks key, prompt or output in errors", leaky)).toBeInstanceOf(
      LlmConformanceFailure,
    );
  });

  it("détecte un adaptateur qui ignore le budget", async () => {
    const lax = broken((inner) => ({
      id: "fake",
      complete: (request) =>
        inner.complete({ ...request, budget: { ...request.budget, maxPromptChars: 10 ** 6 } }),
    }));
    expect(await failureOf("rejects a request over budget before any call", lax)).toBeInstanceOf(
      LlmConformanceFailure,
    );
  });

  it("détecte une sortie déjà validée ou un mauvais modèle servi", async () => {
    const wrong = broken((inner) => ({
      id: "fake",
      complete: async (request) => ({ ...(await inner.complete(request)), model: "autre" }),
    }));
    expect(
      await failureOf("returns text with usage, provider and served model", wrong),
    ).toBeInstanceOf(LlmConformanceFailure);
  });

  it("détecte un adaptateur qui ne mappe pas la clé refusée sur LlmAuthError", async () => {
    const generic = broken((inner) => ({
      id: "fake",
      complete: (request) =>
        inner.complete(request).catch(() => {
          throw new Error("échec générique");
        }),
    }));
    expect(await failureOf("rejects a refused key with LlmAuthError", generic)).toBeInstanceOf(
      LlmConformanceFailure,
    );
  });

  it("détecte un adaptateur qui ne plafonne pas retryAfterMs", async () => {
    const uncapped = broken((inner) => ({
      id: "fake",
      complete: (request) =>
        inner.complete(request).catch((error: unknown) => {
          if (error instanceof LlmRateLimitedError) {
            throw Object.assign(error, { retryAfterMs: 10 ** 12 });
          }
          throw error;
        }),
    }));
    expect(await failureOf("caps retryAfterMs on rate limit", uncapped)).toBeInstanceOf(
      LlmConformanceFailure,
    );
  });
});
