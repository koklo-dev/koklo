import type { LlmBudget } from "../llm-budget.ts";
import type { FramedPrompt } from "../llm-prompt.ts";
import type { LlmProvider } from "../llm-provider.ts";
import type { LlmProviderError } from "../llm-provider-errors.ts";
import type {
  LlmOutputSpec,
  LlmRequest,
  LlmResponse,
  LlmStopReason,
  LlmTrace,
} from "../llm-request.ts";

/** Squelette TK-50c (étape RED) : la forme compile, le comportement reste à écrire. */
const NOT_IMPLEMENTED = "TK-50c : FakeLlm non implémenté";

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

/** Faux LLM scripté et déterministe : ni horloge, ni aléa, ni timer ; n'obéit jamais aux données. */
export class FakeLlm implements LlmProvider {
  readonly id = "fake" as const;

  readonly options: FakeLlmOptions;

  constructor(options: FakeLlmOptions = {}) {
    this.options = options;
  }

  /** Répond toujours la même sortie (texte ou JSON), sans épuisement. */
  static replying(_output: unknown, _options: FakeLlmOptions = {}): FakeLlm {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** Échoue toujours avec cette erreur typée (`timingOut` = `failing(new LlmTimeoutError(...))`). */
  static failing(_error: LlmProviderError, _options: FakeLlmOptions = {}): FakeLlm {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** Étapes consommées une fois ; épuisé -> `FakeLlmScriptExhaustedError`. */
  script(_steps: readonly FakeLlmStep[]): this {
    throw new Error(NOT_IMPLEMENTED);
  }

  get calls(): readonly FakeLlmCall[] {
    throw new Error(NOT_IMPLEMENTED);
  }

  complete(_request: LlmRequest): Promise<LlmResponse> {
    return Promise.reject(new Error(NOT_IMPLEMENTED));
  }
}
