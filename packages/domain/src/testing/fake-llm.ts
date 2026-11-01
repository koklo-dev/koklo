import type { LlmBudget } from "../llm-budget.ts";
import { revealLlmCredential } from "../llm-credential.ts";
import { unvalidated } from "../llm-output.ts";
import type { FramedPrompt } from "../llm-prompt.ts";
import type { LlmProvider } from "../llm-provider.ts";
import { LlmAuthError, type LlmProviderError } from "../llm-provider-errors.ts";
import {
  assertLlmRequest,
  type LlmOutputSpec,
  type LlmRequest,
  type LlmResponse,
  type LlmStopReason,
  type LlmTrace,
} from "../llm-request.ts";

/** Approximation fixe : un token pour quatre caractères (déterministe, sans tokenizer). */
const CHARS_PER_TOKEN = 4;
const tokensOf = (chars: number): number => Math.ceil(chars / CHARS_PER_TOKEN);

/** Un appel enregistré : jamais la clé (`credential` est absent par construction). */
export interface FakeLlmCall {
  readonly model: string;
  readonly prompt: FramedPrompt;
  readonly output: LlmOutputSpec;
  readonly budget: LlmBudget;
  readonly temperature?: number;
  readonly trace: LlmTrace;
}

export type FakeLlmReply = {
  readonly reply: unknown;
  readonly stop?: LlmStopReason;
};
export type FakeLlmFailure = { readonly fail: LlmProviderError };
/** `when` choisit l'étape (la première non consommée qui correspond) ; sans `when`, la suivante. */
export type FakeLlmStep = (FakeLlmReply | FakeLlmFailure) & {
  readonly when?: (call: FakeLlmCall) => boolean;
};

export interface FakeLlmOptions {
  /** Modèle servi renvoyé dans la réponse (défaut : le modèle demandé). */
  readonly servedModel?: string;
  /** Clés que le faux refuse avec `LlmAuthError`. */
  readonly rejectedKeys?: readonly string[];
}

/** Le script est épuisé : l'appelant a fait plus d'appels que d'étapes (jamais de contenu). */
export class FakeLlmScriptExhaustedError extends Error {
  constructor() {
    super("Le script du faux LLM est épuisé");
    this.name = "FakeLlmScriptExhaustedError";
  }
}

type FakeLlmOutcome = FakeLlmReply | (FakeLlmFailure & { readonly fresh?: true });

/** Copie de l'erreur (même classe, mêmes propriétés propres) : une instance neuve par appel. */
const freshCopy = (error: LlmProviderError): LlmProviderError =>
  Object.defineProperties(
    Object.create(Object.getPrototypeOf(error)),
    Object.getOwnPropertyDescriptors(error),
  );

/** Texte tronqué au budget de sortie : `[sortie, tronquée]` ; un JSON n'est jamais tronqué. */
const truncated = (reply: unknown, maxOutputTokens: number): [unknown, boolean] => {
  const limit = maxOutputTokens * CHARS_PER_TOKEN;
  return typeof reply === "string" && reply.length > limit
    ? [reply.slice(0, limit), true]
    : [reply, false];
};

const charsOf = (reply: unknown): number =>
  typeof reply === "string" ? reply.length : (JSON.stringify(reply) ?? "").length;

/** Faux LLM scripté et déterministe : ni horloge, ni aléa, ni timer ; n'obéit jamais aux données. */
export class FakeLlm implements LlmProvider {
  readonly id = "fake" as const;

  readonly options: FakeLlmOptions;
  readonly #steps: FakeLlmStep[] = [];
  readonly #calls: FakeLlmCall[] = [];
  #always: FakeLlmOutcome | undefined;

  /** `options` est copié et gelé, `rejectedKeys` aussi : une mutation ultérieure est sans effet. */
  constructor(options: FakeLlmOptions = {}) {
    this.options = Object.freeze({
      ...options,
      ...(options.rejectedKeys === undefined
        ? {}
        : { rejectedKeys: Object.freeze([...options.rejectedKeys]) }),
    });
  }

  /** Répond toujours la même sortie (texte ou JSON), sans épuisement. */
  static replying(output: unknown, options: FakeLlmOptions = {}): FakeLlm {
    const fake = new FakeLlm(options);
    fake.#always = { reply: structuredClone(output) };
    return fake;
  }

  /** Échoue toujours avec cette erreur typée (`timingOut` = `failing(new LlmTimeoutError(...))`). */
  static failing(error: LlmProviderError, options: FakeLlmOptions = {}): FakeLlm {
    const fake = new FakeLlm(options);
    fake.#always = { fail: error, fresh: true };
    return fake;
  }

  /** Étapes consommées une fois ; épuisé -> `FakeLlmScriptExhaustedError`. */
  script(steps: readonly FakeLlmStep[]): this {
    this.#steps.push(...steps);
    return this;
  }

  get calls(): readonly FakeLlmCall[] {
    return [...this.#calls];
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const snapshot = assertLlmRequest(request);
    if (this.options.rejectedKeys?.includes(revealLlmCredential(snapshot.credential))) {
      throw new LlmAuthError({ operation: "complete", provider: this.id });
    }
    const call: FakeLlmCall = Object.freeze({
      model: snapshot.model,
      prompt: snapshot.prompt,
      output: snapshot.output,
      budget: snapshot.budget,
      trace: snapshot.trace,
      ...(snapshot.temperature === undefined ? {} : { temperature: snapshot.temperature }),
    });
    this.#calls.push(call);
    const outcome = this.#next(call);
    if ("fail" in outcome) {
      throw "fresh" in outcome ? freshCopy(outcome.fail) : outcome.fail;
    }
    return this.#respond(snapshot, outcome);
  }

  /** Première étape non consommée dont `when` accepte l'appel, sinon la sortie permanente. */
  #next(call: FakeLlmCall): FakeLlmOutcome {
    const index = this.#steps.findIndex((step) => step.when?.(call) ?? true);
    if (index >= 0) {
      return this.#steps.splice(index, 1)[0] as FakeLlmStep;
    }
    if (this.#always === undefined) {
      throw new FakeLlmScriptExhaustedError();
    }
    return this.#always;
  }

  #respond(request: LlmRequest, outcome: FakeLlmReply): LlmResponse {
    const { prompt, budget } = request;
    const [output, cut] = truncated(structuredClone(outcome.reply), budget.maxOutputTokens);
    return {
      output: unvalidated(output),
      stop: cut ? "max-tokens" : (outcome.stop ?? "end"),
      usage: {
        inputTokens: tokensOf(prompt.system.length + prompt.user.length),
        outputTokens: Math.min(tokensOf(charsOf(output)), budget.maxOutputTokens),
      },
      provider: this.id,
      model: this.options.servedModel ?? request.model,
    };
  }
}
