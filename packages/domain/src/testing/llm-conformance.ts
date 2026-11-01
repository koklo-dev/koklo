import { llmCredential } from "../llm-credential.ts";
import { InvalidLlmRequestError } from "../llm-errors.ts";
import { isValidated } from "../llm-output.ts";
import { framePrompt } from "../llm-prompt.ts";
import type { LlmProvider } from "../llm-provider.ts";
import {
  LLM_MAX_RETRY_AFTER_MS,
  LlmAbortedError,
  LlmAuthError,
  LlmBudgetExceededError,
  LlmContextTooLongError,
  LlmModelNotFoundError,
  LlmProviderUnavailableError,
  LlmQuotaExceededError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmTimeoutError,
} from "../llm-provider-errors.ts";
import { LLM_STOP_REASONS, type LlmRequest } from "../llm-request.ts";
import { trusted } from "../trusted.ts";
import { Untrusted } from "../untrusted.ts";

/** Échec d'un cas de conformité (le domaine n'a pas de bibliothèque d'assertion). */
export class LlmConformanceFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConformanceFailure";
  }
}

/** Chaque déclencheur de panne et l'erreur typée que tout adaptateur doit lever. */
const ERROR_FOR = {
  "rate-limited": LlmRateLimitedError,
  timeout: LlmTimeoutError,
  unavailable: LlmProviderUnavailableError,
  refused: LlmRefusedError,
  quota: LlmQuotaExceededError,
  "model-not-found": LlmModelNotFoundError,
  "context-too-long": LlmContextTooLongError,
} as const;
export type LlmFailureTrigger = keyof typeof ERROR_FOR;
export const LLM_FAILURE_TRIGGERS = Object.keys(ERROR_FOR) as readonly LlmFailureTrigger[];

/** Ce que la fabrique d'un adaptateur fournit : le fournisseur et ses déclencheurs. */
export interface LlmConformanceSubject {
  readonly provider: LlmProvider;
  readonly validKey: string;
  /** Clé que le sujet refuse (-> `LlmAuthError`). */
  readonly invalidKey: string;
  /** Modèle servi attendu dans la réponse (peut différer du modèle demandé). */
  readonly servedModel: string;
  /** Programme la prochaine réponse : texte ou JSON. */
  replyWith(output: unknown): void | Promise<void>;
  /** Programme le prochain appel en échec typé. */
  failWith(trigger: LlmFailureTrigger): void | Promise<void>;
  /** Nombre d'appels qui ont atteint le fournisseur (transport) : 0 si la garde a refusé. */
  callsMade(): number;
}
export type LlmConformanceFactory = () => LlmConformanceSubject | Promise<LlmConformanceSubject>;

export interface LlmConformanceCase {
  readonly name: string;
  run(factory: LlmConformanceFactory): Promise<void>;
}

/** Noms des cas, dans l'ordre (voir 03-red-50c.md). */
export const LLM_CONFORMANCE_CASE_NAMES = [
  "returns text with usage, provider and served model",
  "returns json output as unvalidated, never validated",
  "is deterministic for identical requests",
  "rejects a refused key with LlmAuthError",
  "maps every failure trigger to its typed error",
  "caps retryAfterMs on rate limit",
  "rejects a request over budget before any call",
  "stops with max-tokens when the output exceeds the budget",
  "rejects an already aborted signal with LlmAbortedError before any call",
  "refuses a request that did not pass the guard before any call",
  "never leaks key, prompt or output in errors",
] as const;

type CaseName = (typeof LLM_CONFORMANCE_CASE_NAMES)[number];
type CaseBody = (subject: LlmConformanceSubject) => Promise<void>;

const PROMPT_SENTINEL = "PROMPT-SENTINELLE-CONFORMITE";
const OUTPUT_SENTINEL = "OUTPUT-SENTINELLE-CONFORMITE";
const BUDGET = {
  maxOutputTokens: 1_000,
  timeoutMs: 30_000,
  maxPromptChars: 10_000,
  maxCostMicroUsd: 100_000,
};
const prompt = framePrompt({
  instructions: trusted`Résume les données.`,
  data: [new Untrusted("brief", PROMPT_SENTINEL)],
  nonce: "Cf0rm4n3Nonce9Zq7",
});
const PROMPT_CHARS = prompt.system.length + prompt.user.length;

const requestFor = (
  subject: LlmConformanceSubject,
  overrides: Partial<LlmRequest> = {},
): LlmRequest => ({
  model: "conformance-model-1",
  credential: llmCredential(subject.validKey),
  prompt,
  output: { kind: "text" },
  budget: BUDGET,
  trace: { purpose: "conformance", correlationId: "conf-0001" },
  ...overrides,
});

const check = (ok: boolean, message: string): void => {
  if (!ok) throw new LlmConformanceFailure(message);
};

/** L'erreur levée par l'appel, ou un échec de conformité si l'appel réussit. */
const rejection = async (call: Promise<unknown>): Promise<unknown> => {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new LlmConformanceFailure("l'appel aurait dû être rejeté");
};

const expectRejection = async <T extends Error>(
  call: Promise<unknown>,
  type: new (...args: never[]) => T,
  label: string,
): Promise<T> => {
  const error = await rejection(call);
  check(error instanceof type, `${label} : erreur typée attendue (${type.name})`);
  return error as T;
};

const noLeak = (error: unknown, secrets: readonly string[], label: string): void => {
  const failure = error as Error;
  const text = [JSON.stringify(error), failure.message, failure.stack].join("\n");
  for (const secret of secrets) {
    check(!text.includes(secret), `${label} : l'erreur divulgue une donnée sensible`);
  }
};

const CASES: Record<CaseName, CaseBody> = {
  "returns text with usage, provider and served model": async (subject) => {
    await subject.replyWith("bonjour");
    const response = await subject.provider.complete(requestFor(subject));
    check(
      (response.output as unknown) === "bonjour",
      "la sortie texte doit être renvoyée telle quelle",
    );
    check(LLM_STOP_REASONS.includes(response.stop), "raison d'arrêt hors liste");
    const { inputTokens, outputTokens } = response.usage;
    check(Number.isInteger(inputTokens) && inputTokens >= 0, "usage.inputTokens invalide");
    check(Number.isInteger(outputTokens) && outputTokens >= 0, "usage.outputTokens invalide");
    check(
      response.provider === subject.provider.id,
      "provider différent de l'identifiant du fournisseur",
    );
    check(response.model === subject.servedModel, "le modèle servi doit être celui du fournisseur");
  },
  "returns json output as unvalidated, never validated": async (subject) => {
    await subject.replyWith({ items: [1, 2] });
    const request = requestFor(subject, { output: { kind: "json", schema: { type: "object" } } });
    const { output } = await subject.provider.complete(request);
    check(JSON.stringify(output) === '{"items":[1,2]}', "le JSON programmé doit être renvoyé");
    check(!isValidated(output), "une sortie de fournisseur n'est jamais validée");
  },
  "is deterministic for identical requests": async (subject) => {
    const answers: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await subject.replyWith("même sortie");
      answers.push(JSON.stringify(await subject.provider.complete(requestFor(subject))));
    }
    check(answers[0] === answers[1], "deux requêtes identiques doivent donner la même réponse");
  },
  "rejects a refused key with LlmAuthError": async (subject) => {
    const request = requestFor(subject, { credential: llmCredential(subject.invalidKey) });
    await expectRejection(subject.provider.complete(request), LlmAuthError, "clé refusée");
  },
  "maps every failure trigger to its typed error": async (subject) => {
    for (const trigger of LLM_FAILURE_TRIGGERS) {
      await subject.failWith(trigger);
      await expectRejection(
        subject.provider.complete(requestFor(subject)),
        ERROR_FOR[trigger],
        trigger,
      );
    }
  },
  "caps retryAfterMs on rate limit": async (subject) => {
    await subject.failWith("rate-limited");
    const error = await expectRejection(
      subject.provider.complete(requestFor(subject)),
      LlmRateLimitedError,
      "rate-limited",
    );
    const delay = error.retryAfterMs;
    check(
      Number.isInteger(delay) && delay >= 0 && delay <= LLM_MAX_RETRY_AFTER_MS,
      "retryAfterMs doit être plafonné",
    );
  },
  "rejects a request over budget before any call": async (subject) => {
    await subject.replyWith("ok");
    const exact = { ...BUDGET, maxPromptChars: PROMPT_CHARS };
    await subject.provider.complete(requestFor(subject, { budget: exact }));
    const before = subject.callsMade();
    const tight = { ...BUDGET, maxPromptChars: PROMPT_CHARS - 1 };
    const error = await expectRejection(
      subject.provider.complete(requestFor(subject, { budget: tight })),
      LlmBudgetExceededError,
      "budget dépassé",
    );
    check(error.limit === "prompt-chars", "la limite dépassée doit être « prompt-chars »");
    check(subject.callsMade() === before, "aucun appel ne doit atteindre le fournisseur");
  },
  "stops with max-tokens when the output exceeds the budget": async (subject) => {
    await subject.replyWith("x".repeat(4_000));
    const budget = { ...BUDGET, maxOutputTokens: 10 };
    const response = await subject.provider.complete(requestFor(subject, { budget }));
    check(response.stop === "max-tokens", "l'arrêt doit être « max-tokens »");
    check(response.usage.outputTokens <= 10, "la sortie ne peut pas dépasser maxOutputTokens");
  },
  "rejects an already aborted signal with LlmAbortedError before any call": async (subject) => {
    const controller = new AbortController();
    controller.abort();
    const before = subject.callsMade();
    const request = requestFor(subject, { signal: controller.signal });
    await expectRejection(subject.provider.complete(request), LlmAbortedError, "signal annulé");
    check(subject.callsMade() === before, "aucun appel ne doit atteindre le fournisseur");
  },
  "refuses a request that did not pass the guard before any call": async (subject) => {
    const before = subject.callsMade();
    const forged = requestFor(subject, { prompt: { system: "s", user: "u" } as never });
    await expectRejection(
      subject.provider.complete(forged),
      InvalidLlmRequestError,
      "requête forgée",
    );
    check(subject.callsMade() === before, "aucun appel ne doit atteindre le fournisseur");
  },
  "never leaks key, prompt or output in errors": async (subject) => {
    const secrets = [subject.validKey, subject.invalidKey, PROMPT_SENTINEL, OUTPUT_SENTINEL];
    const refused = requestFor(subject, { credential: llmCredential(subject.invalidKey) });
    await subject.replyWith(OUTPUT_SENTINEL);
    noLeak(await rejection(subject.provider.complete(refused)), secrets, "clé refusée");
    for (const trigger of LLM_FAILURE_TRIGGERS) {
      await subject.failWith(trigger);
      noLeak(await rejection(subject.provider.complete(requestFor(subject))), secrets, trigger);
    }
    const tight = { ...BUDGET, maxPromptChars: PROMPT_CHARS - 1 };
    noLeak(
      await rejection(subject.provider.complete(requestFor(subject, { budget: tight }))),
      secrets,
      "budget",
    );
  },
};

/** Une erreur inattendue du sujet devient un échec de conformité (nom seul, jamais le message). */
const runCase = async (body: CaseBody, subject: LlmConformanceSubject): Promise<void> => {
  try {
    await body(subject);
  } catch (error) {
    if (error instanceof LlmConformanceFailure) {
      throw error;
    }
    const name = error instanceof Error ? error.name : "inconnue";
    throw new LlmConformanceFailure(`erreur inattendue du sujet (${name})`);
  }
};

export const llmConformanceCases = (): readonly LlmConformanceCase[] =>
  LLM_CONFORMANCE_CASE_NAMES.map((name) => ({
    name,
    run: async (factory) => runCase(CASES[name], await factory()),
  }));

/** Enveloppe de test (vitest ou autre) : le domaine n'importe aucun moteur de test. */
export interface LlmConformanceHarness {
  describe(name: string, body: () => void): void;
  it(name: string, body: () => Promise<void>): void;
}

/** Enregistre tous les cas sous `describe(name)` ; partagée entre le faux et l'adaptateur (TK-54). */
export const runLlmConformance = (
  name: string,
  factory: LlmConformanceFactory,
  harness: LlmConformanceHarness,
): void => {
  harness.describe(name, () => {
    for (const testCase of llmConformanceCases()) {
      harness.it(testCase.name, () => testCase.run(factory));
    }
  });
};
