import type { LlmProvider } from "../llm-provider.ts";

/** Squelette TK-50c (étape RED) : la forme compile, les cas restent à écrire. */
const NOT_IMPLEMENTED = "TK-50c : suite de conformité non implémentée";

/** Échec d'un cas de conformité (le domaine n'a pas de bibliothèque d'assertion). */
export class LlmConformanceFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConformanceFailure";
  }
}

export const LLM_FAILURE_TRIGGERS = [
  "rate-limited",
  "timeout",
  "unavailable",
  "refused",
  "quota",
  "model-not-found",
  "context-too-long",
] as const;
export type LlmFailureTrigger = (typeof LLM_FAILURE_TRIGGERS)[number];

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

export const llmConformanceCases = (): readonly LlmConformanceCase[] =>
  LLM_CONFORMANCE_CASE_NAMES.map((name) => ({
    name,
    run: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
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
