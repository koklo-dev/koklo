import {
  assertLlmRequest,
  LlmAbortedError,
  LlmBudgetExceededError,
  type LlmProvider,
  LlmProviderError,
  type LlmRequest,
  type LlmResponse,
  LlmTimeoutError,
  revealLlmCredential,
} from "@koklo/domain";
import { errorForStatus } from "./anthropic-errors.ts";
import { costUpperBoundMicroUsd } from "./anthropic-pricing.ts";
import { buildBody, buildHeaders } from "./anthropic-request.ts";
import { parseMessage } from "./anthropic-response.ts";
import { discardBody, readBoundedText } from "./bounded-body.ts";
import { ANTHROPIC_MESSAGES_URL } from "./constants.ts";
import { diagnosticOf, unavailable } from "./diagnostic.ts";
import type { FetchLike } from "./fetch-like.ts";

export interface AnthropicProviderOptions {
  /** Transport injectable ; par défaut `globalThis.fetch`, lu à chaque appel. Aucune URL ici. */
  readonly fetch?: FetchLike;
}

interface Exchange {
  readonly status: number;
  readonly text: string;
}

const isTimeout = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { name?: unknown }).name === "TimeoutError";

/** Adaptateur Anthropic du port `LlmProvider` (fetch direct, sans SDK, TK-54 D2). */
export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic" as const;

  readonly #fetch: FetchLike | undefined;

  constructor(options: AnthropicProviderOptions = {}) {
    this.#fetch = options.fetch;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const snapshot = assertLlmRequest(request);
    assertCostWithinBudget(snapshot);
    const deadline = AbortSignal.timeout(snapshot.budget.timeoutMs);
    const signal = AbortSignal.any(
      snapshot.signal === undefined ? [deadline] : [snapshot.signal, deadline],
    );
    let exchange: Exchange;
    try {
      exchange = await this.#exchange(snapshot, signal);
    } catch (error) {
      throw classify(error, snapshot.signal, deadline);
    }
    return parseMessage(exchange.text, snapshot.output);
  }

  /** Un seul appel : la clé n'est lue qu'ici, après la garde et le contrôle de coût. */
  async #exchange(request: LlmRequest, signal: AbortSignal): Promise<Exchange> {
    const send = this.#fetch ?? globalThis.fetch;
    const init: RequestInit = {
      method: "POST",
      headers: buildHeaders(revealLlmCredential(request.credential)),
      body: buildBody(request),
      redirect: "error",
      signal,
    };
    const response = await send(ANTHROPIC_MESSAGES_URL, init);
    const { status } = response;
    if (status === 200) {
      return { status, text: await readBoundedText(response) };
    }
    const text = status === 400 ? await readBoundedText(response) : "";
    if (status !== 400) {
      await discardBody(response);
    }
    throw errorForStatus(status, response.headers.get("retry-after"), text);
  }
}

const assertCostWithinBudget = (request: LlmRequest): void => {
  const { model, prompt, budget } = request;
  const bound = costUpperBoundMicroUsd(
    model,
    prompt.system.length + prompt.user.length,
    budget.maxOutputTokens,
  );
  if (bound > budget.maxCostMicroUsd) {
    throw new LlmBudgetExceededError({ ...diagnosticOf(), limit: "cost" });
  }
};

/** Erreur typée d'un échec d'envoi ou de lecture : annulation de l'appelant, délai, ou indisponible. */
const classify = (
  error: unknown,
  caller: AbortSignal | undefined,
  deadline: AbortSignal,
): LlmProviderError => {
  if (error instanceof LlmProviderError) {
    return error;
  }
  if (caller?.aborted) {
    return new LlmAbortedError(diagnosticOf());
  }
  if (deadline.aborted || isTimeout(error)) {
    return new LlmTimeoutError(diagnosticOf());
  }
  return unavailable();
};
