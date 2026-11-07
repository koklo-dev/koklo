import {
  assertLlmRequest,
  InvalidLlmRequestError,
  LlmAbortedError,
  LlmBudgetExceededError,
  type LlmProvider,
  type LlmProviderId,
  type LlmRequest,
  type LlmResponse,
  type LlmStreamEvent,
  revealLlmCredential,
  unvalidated,
} from "@koklo/domain";
import { generateText, jsonSchema, Output, streamText } from "ai";
import { type CallOperation, diagnosticOf, type ErrorContext } from "../common/diagnostic.ts";
import { systemHostResolver } from "../common/dns-resolver.ts";
import type { FetchLike } from "../common/fetch-like.ts";
import { guardedFetch } from "../common/guarded-fetch.ts";
import { costUpperBoundFor } from "../common/pricing.ts";
import { assertResolvesPublic, assertSafeBaseUrl, type HostResolver } from "../common/ssrf.ts";
import { createModel } from "./create-model.ts";
import { type FailureSignals, toPortError } from "./sdk-errors.ts";
import { servedModelOf, stopOf, usageOf } from "./sdk-result.ts";

// Le SDK écrit ses avertissements sur la console du processus : ils n'ont pas leur place dans nos journaux.
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

export interface SdkProviderOptions {
  /** Transport injectable ; par défaut `globalThis.fetch`, lu à chaque appel. */
  readonly fetch?: FetchLike | undefined;
  /** Résolution DNS de l'anti-rebond (défaut : le système) ; injectée par les tests. */
  readonly resolveHost?: HostResolver | undefined;
  /** Test seulement, posé par le code : autorise `http://127.0.0.1` pour un faux serveur. */
  readonly allowInsecureLoopbackForTests?: boolean | undefined;
}

/** Fournisseurs dont le modèle n'entre pas dans le chemin de l'URL : `fournisseur/modèle` admis. */
const SLASH_MODELS: ReadonlySet<LlmProviderId> = new Set(["openrouter", "openai_compatible"]);

interface Prepared {
  readonly snapshot: LlmRequest;
  readonly context: ErrorContext;
  readonly deadline: AbortSignal;
  readonly signals: FailureSignals;
  readonly model: ReturnType<typeof createModel>;
}

const noop = (): void => undefined;

/** Adaptateur du port `LlmProvider` au-dessus du SDK : une classe, six fournisseurs. */
export class SdkLlmProvider implements LlmProvider {
  readonly id: LlmProviderId;
  readonly #options: SdkProviderOptions;

  constructor(id: LlmProviderId, options: SdkProviderOptions = {}) {
    this.id = id;
    this.#options = options;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const call = await this.#prepare(assertLlmRequest(request, "complete"), "complete");
    const { snapshot } = call;
    try {
      const result = await generateText({
        ...this.#settings(call, AbortSignal.any(this.#abortSignals(call))),
        output:
          snapshot.output.kind === "json"
            ? Output.object({ schema: jsonSchema(snapshot.output.schema) })
            : Output.text(),
      });
      return {
        output: unvalidated(snapshot.output.kind === "json" ? result.output : result.text),
        stop: stopOf(result, call.context),
        usage: usageOf(result.totalUsage),
        provider: this.id,
        model: servedModelOf(result.response.modelId, call.context),
      };
    } catch (error) {
      throw toPortError(error, call.context, call.signals);
    }
  }

  async *stream(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const snapshot = assertLlmRequest(request, "stream");
    if (snapshot.output.kind !== "text") {
      throw new InvalidLlmRequestError("output");
    }
    const call = await this.#prepare(snapshot, "stream");
    const stop = new AbortController();
    try {
      const result = streamText({
        ...this.#settings(call, AbortSignal.any([...this.#abortSignals(call), stop.signal])),
        onError: noop,
      });
      let end: LlmStreamEvent | undefined;
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          yield { type: "text", text: part.text };
        } else if (part.type === "error") {
          throw part.error;
        } else if (part.type === "finish") {
          end = {
            type: "end",
            stop: stopOf(part, call.context),
            usage: usageOf(part.totalUsage),
            provider: this.id,
            model: servedModelOf((await result.response).modelId, call.context),
          };
        }
      }
      if (snapshot.signal?.aborted) {
        throw new LlmAbortedError(diagnosticOf(call.context));
      }
      if (end === undefined) {
        throw new Error("flux sans fin");
      }
      yield end;
    } catch (error) {
      throw toPortError(error, call.context, call.signals);
    } finally {
      stop.abort();
    }
  }

  #abortSignals({ snapshot, deadline }: Prepared): AbortSignal[] {
    return snapshot.signal === undefined ? [deadline] : [snapshot.signal, deadline];
  }

  /** Réglages communs de l'appel : un seul essai, sans outil ; la clé est lue ici, au dernier moment. */
  #settings({ snapshot, model }: Prepared, abortSignal: AbortSignal) {
    return {
      model,
      system: snapshot.prompt.system,
      prompt: snapshot.prompt.user,
      maxOutputTokens: snapshot.budget.maxOutputTokens,
      maxRetries: 0,
      abortSignal,
      ...(snapshot.temperature === undefined ? {} : { temperature: snapshot.temperature }),
    };
  }

  async #prepare(snapshot: LlmRequest, operation: CallOperation): Promise<Prepared> {
    const context: ErrorContext = { provider: this.id, operation };
    this.#assertModel(snapshot.model);
    const baseUrl = await this.#checkedBaseUrl(snapshot.baseUrl);
    this.#assertCostWithinBudget(snapshot, context);
    const deadline = AbortSignal.timeout(snapshot.budget.timeoutMs);
    const model = createModel(
      this.id,
      {
        apiKey: revealLlmCredential(snapshot.credential),
        ...(baseUrl === undefined ? {} : { baseUrl }),
        fetch: guardedFetch(this.#options.fetch, context),
      },
      snapshot.model,
    );
    return { snapshot, context, deadline, signals: { caller: snapshot.signal, deadline }, model };
  }

  #assertModel(model: string): void {
    if (model.includes("/") && !SLASH_MODELS.has(this.id)) {
      throw new InvalidLlmRequestError("model");
    }
  }

  /** `baseUrl` : exigée et contrôlée pour `openai_compatible`, refusée ailleurs (anti-SSRF). */
  async #checkedBaseUrl(raw: string | undefined): Promise<string | undefined> {
    if ((this.id === "openai_compatible") !== (raw !== undefined)) {
      throw new InvalidLlmRequestError("baseUrl");
    }
    if (raw === undefined) {
      return undefined;
    }
    try {
      const url = assertSafeBaseUrl(raw, {
        allowInsecureLoopbackForTests: this.#options.allowInsecureLoopbackForTests === true,
      });
      await assertResolvesPublic(url, this.#options.resolveHost ?? systemHostResolver);
      return raw.replace(/\/+$/, "");
    } catch {
      throw new InvalidLlmRequestError("baseUrl");
    }
  }

  #assertCostWithinBudget(request: LlmRequest, context: ErrorContext): void {
    const { model, prompt, budget } = request;
    const bound = costUpperBoundFor(
      this.id,
      model,
      prompt.system.length + prompt.user.length,
      budget.maxOutputTokens,
    );
    if (bound > budget.maxCostMicroUsd) {
      throw new LlmBudgetExceededError({ ...diagnosticOf(context), limit: "cost" });
    }
  }
}

export const createSdkProvider = (
  id: LlmProviderId,
  options: SdkProviderOptions = {},
): LlmProvider => new SdkLlmProvider(id, options);
