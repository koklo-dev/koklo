import { describe, expect, it } from "vitest";
import {
  assertLlmRequest,
  InvalidLlmRequestError,
  isValidated,
  LlmAbortedError,
  LlmAuthError,
  LlmContextTooLongError,
  LlmModelNotFoundError,
  type LlmProvider,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmRefusedError,
  type LlmRequest,
  type LlmResponse,
  LlmTimeoutError,
  revealLlmCredential,
  unvalidated,
  validateLlmOutput,
} from "../src/index.ts";
import {
  FakeLlm,
  LLM_CONFORMANCE_CASE_NAMES,
  LLM_CONFORMANCE_HARDENING_CASE_NAMES,
  type LlmConformanceFactory,
  LlmConformanceFailure,
  type LlmConformanceHardeningSubject,
  type LlmConformanceSubject,
  type LlmFailureTrigger,
  llmConformanceCases,
} from "../src/testing/index.ts";
import { makeRequest, SECRET_KEY } from "./llm-helpers.ts";

type Subject = LlmConformanceSubject & LlmConformanceHardeningSubject;
const [ABORTED, SINGLE_CALL, NO_CAUSE, NO_LOGS, TEXT_UNVALIDATED] =
  LLM_CONFORMANCE_HARDENING_CASE_NAMES;

const KEY = "sk-valide-HARDENING-0001";
const OP = { operation: "complete" } as const;
const ERRORS = {
  "rate-limited": class extends LlmRateLimitedError {
    constructor() {
      super({ ...OP, retryAfterMs: 1 });
    }
  },
  timeout: class extends LlmTimeoutError {
    constructor() {
      super(OP);
    }
  },
  unavailable: class extends LlmProviderUnavailableError {
    constructor() {
      super(OP);
    }
  },
  refused: class extends LlmRefusedError {
    constructor() {
      super(OP);
    }
  },
  quota: class extends LlmQuotaExceededError {
    constructor() {
      super(OP);
    }
  },
  "model-not-found": class extends LlmModelNotFoundError {
    constructor() {
      super(OP);
    }
  },
  "context-too-long": class extends LlmContextTooLongError {
    constructor() {
      super(OP);
    }
  },
} satisfies Record<LlmFailureTrigger, new () => Error>;

/** Sujet de base : sa seule fonction est d'être corrigé ou rendu défectueux par chaque test. */
interface Knobs {
  retries?: number;
  hangs?: "never-settles" | "generic-error" | "aborted";
  causeLeak?: "cause" | "hidden";
  logs?: string[];
  validatedText?: boolean;
  withCapabilities?: boolean;
}

const subjectWith = (knobs: Knobs = {}): Subject => {
  let made = 0;
  let hanging = false;
  let armed: LlmFailureTrigger | undefined;
  const provider: LlmProvider = {
    id: "fake",
    complete: async (request: LlmRequest): Promise<LlmResponse> => {
      const snapshot = assertLlmRequest(request);
      made += 1 + (knobs.retries ?? 0);
      if (hanging) {
        hanging = false;
        await new Promise<void>((_resolve, reject) => {
          if (knobs.hangs === "never-settles") return;
          snapshot.signal?.addEventListener("abort", () =>
            reject(knobs.hangs === "generic-error" ? new Error("oups") : new LlmAbortedError(OP)),
          );
        });
      }
      if (armed) {
        const failure = new ERRORS[armed]();
        armed = undefined;
        if (knobs.causeLeak === "cause") {
          Object.assign(failure, { cause: new Error(`clé ${KEY}`) });
        } else if (knobs.causeLeak === "hidden") {
          Object.defineProperty(failure, "debug", { value: { key: KEY }, enumerable: false });
        }
        throw failure;
      }
      knobs.logs?.push(`appel avec ${revealLlmCredential(snapshot.credential)}`);
      const text = unvalidated("réponse");
      const output = knobs.validatedText
        ? (validateLlmOutput(text, (raw) => raw) as unknown as typeof text)
        : text;
      return {
        output,
        stop: "end",
        usage: { inputTokens: 1, outputTokens: 1 },
        provider: "fake",
        model: "m",
      };
    },
  };
  const base: LlmConformanceSubject = {
    provider,
    validKey: KEY,
    invalidKey: "sk-refusee-HARDENING-0002",
    servedModel: "m",
    replyWith: () => undefined,
    failWith: (trigger) => {
      armed = trigger;
    },
    callsMade: () => made,
  };
  return knobs.withCapabilities === false
    ? base
    : {
        ...base,
        hangNext: () => {
          hanging = true;
        },
        capturedLogs: () => knobs.logs ?? [],
      };
};

const failureOf = async (name: string, factory: LlmConformanceFactory): Promise<unknown> => {
  const testCase = llmConformanceCases().find((c) => c.name === name);
  expect(testCase, `cas « ${name} » absent de la suite`).toBeDefined();
  return testCase?.run(factory).then(
    () => undefined,
    (error: unknown) => error,
  );
};

describe("cas renforcés de la suite de conformité (TK-54a)", () => {
  it("les cinq cas rejoignent la liste fermée, sans doublon", () => {
    for (const name of LLM_CONFORMANCE_HARDENING_CASE_NAMES) {
      expect(LLM_CONFORMANCE_CASE_NAMES).toContain(name);
    }
    expect(new Set(LLM_CONFORMANCE_CASE_NAMES).size).toBe(LLM_CONFORMANCE_CASE_NAMES.length);
    expect(LLM_CONFORMANCE_CASE_NAMES.length).toBe(16);
  });

  it.each(LLM_CONFORMANCE_HARDENING_CASE_NAMES)("%s : un bon sujet passe", async (name) => {
    expect(await failureOf(name, () => subjectWith())).toBeUndefined();
  });

  it.each(LLM_CONFORMANCE_HARDENING_CASE_NAMES)(
    "%s : un sujet sans capacités facultatives passe sans les exercer",
    async (name) => {
      expect(await failureOf(name, () => subjectWith({ withCapabilities: false }))).toBeUndefined();
    },
  );
});

describe("méta-tests : sujets défectueux détectés", () => {
  it("annulation ignorée (l'appel ne se termine jamais) -> échec de conformité", async () => {
    const failure = await failureOf(ABORTED, () => subjectWith({ hangs: "never-settles" }));
    expect(failure).toBeInstanceOf(LlmConformanceFailure);
  });

  it("annulation mappée sur une erreur générique -> échec de conformité", async () => {
    const failure = await failureOf(ABORTED, () => subjectWith({ hangs: "generic-error" }));
    expect(failure).toBeInstanceOf(LlmConformanceFailure);
  });

  it("annulation correcte -> passe, et exactement un appel a atteint le fournisseur", async () => {
    expect(await failureOf(ABORTED, () => subjectWith({ hangs: "aborted" }))).toBeUndefined();
  });

  it("un adaptateur qui réessaie (deux appels par complete) -> échec de conformité", async () => {
    const failure = await failureOf(SINGLE_CALL, () => subjectWith({ retries: 1 }));
    expect(failure).toBeInstanceOf(LlmConformanceFailure);
  });

  it("une clé dans `cause` -> échec de conformité", async () => {
    const failure = await failureOf(NO_CAUSE, () => subjectWith({ causeLeak: "cause" }));
    expect(failure).toBeInstanceOf(LlmConformanceFailure);
  });

  it("une clé dans une propriété non énumérable imbriquée -> échec de conformité", async () => {
    const failure = await failureOf(NO_CAUSE, () => subjectWith({ causeLeak: "hidden" }));
    expect(failure).toBeInstanceOf(LlmConformanceFailure);
  });

  it("une clé écrite dans le journal du sujet -> échec de conformité", async () => {
    const failure = await failureOf(NO_LOGS, () => subjectWith({ logs: [] }));
    expect(failure).toBeInstanceOf(LlmConformanceFailure);
  });

  it("une sortie texte déjà validée -> échec de conformité", async () => {
    const failure = await failureOf(TEXT_UNVALIDATED, () => subjectWith({ validatedText: true }));
    expect(failure).toBeInstanceOf(LlmConformanceFailure);
    expect(isValidated(validateLlmOutput(unvalidated("x"), (r) => r))).toBe(true);
  });
});

describe("garde de requête : le schéma JSON ne contient que du JSON", () => {
  const schemaWith = (value: unknown) =>
    makeRequest({ output: { kind: "json", schema: { type: "object", default: value } } });

  it.each([
    ["Map", () => new Map([["a", 1]])],
    ["Set", () => new Set([1])],
    ["Date", () => new Date(0)],
    ["instance de classe", () => new (class Custom {})()],
    ["NaN", () => Number.NaN],
    ["Infinity", () => Number.POSITIVE_INFINITY],
    ["undefined imbriqué dans un tableau", () => [undefined]],
  ])("refuse %s dans le schéma (InvalidLlmRequestError « output »)", (_label, make) => {
    expect(() => assertLlmRequest(schemaWith(make()))).toThrow(InvalidLlmRequestError);
    try {
      assertLlmRequest(schemaWith(make()));
    } catch (error) {
      expect((error as InvalidLlmRequestError).reason).toBe("output");
    }
  });

  it("accepte un schéma JSON ordinaire (objets, tableaux, chaînes, nombres, booléens, null)", () => {
    const value = { a: [1, "x", true, null, { b: 2.5 }] };
    expect(() => assertLlmRequest(schemaWith(value))).not.toThrow();
  });
});

describe("FakeLlm : instances d'erreur et clés refusées", () => {
  it("failing lève une NOUVELLE instance d'erreur à chaque appel", async () => {
    const fake = FakeLlm.failing(new LlmAuthError(OP));
    const first = await fake.complete(makeRequest()).catch((e: unknown) => e);
    const second = await fake.complete(makeRequest()).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(LlmAuthError);
    expect(second).toBeInstanceOf(LlmAuthError);
    expect(first).not.toBe(second);
  });

  it("rejectedKeys est gelé et copié : une mutation ultérieure n'a aucun effet", async () => {
    const keys = [SECRET_KEY];
    const fake = FakeLlm.replying("ok", { rejectedKeys: keys });
    expect(Object.isFrozen(fake.options.rejectedKeys)).toBe(true);
    expect(Object.isFrozen(fake.options)).toBe(true);
    keys.length = 0;
    await expect(fake.complete(makeRequest())).rejects.toBeInstanceOf(LlmAuthError);
  });
});
