import {
  type AiCredentialSource,
  type AiEvent,
  type AiEventSink,
  type AiKeyHooks,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type AiRouting,
  type AiRoutingStore,
  type AiUsageMeter,
  InvalidLlmRequestError,
  LlmAuthError,
  type LlmProvider,
  type LlmProviderId,
  type LlmRequest,
  type LlmResponse,
  type LlmStreamEvent,
  type QualifiedModelCatalog,
} from "@koklo/domain";
import { actualCostMicroUsd } from "../common/pricing.ts";
import { type AiCapState, capStateOf } from "./cap.ts";
import { AiCapReachedError, AiNotConfiguredError } from "./errors.ts";
import { fallbackReasonOf } from "./fallback.ts";
import {
  fallbackTarget,
  mainTargets,
  notConfiguredReason,
  type PlanInput,
  type Target,
} from "./plan.ts";

export interface AiProviderRouterDeps {
  readonly routing: AiRoutingStore;
  readonly credentials: AiCredentialSource;
  readonly meter: AiUsageMeter;
  readonly catalog: QualifiedModelCatalog;
  readonly events: AiEventSink;
  /** Vie des clés (dernier usage, rejet) ; facultatif. */
  readonly keys?: AiKeyHooks;
  /** Fabrique de l'adaptateur d'un fournisseur (le moteur ne connaît aucun SDK). */
  readonly providerFor: (id: LlmProviderId) => LlmProvider;
}

/** Cible résolue : fournisseur, modèle, et les éléments de la clé nécessaires à l'appel. */
interface Attempt {
  readonly provider: LlmProviderId;
  readonly model: string;
  readonly credential: LlmRequest["credential"];
  readonly baseUrl?: string;
  readonly revision?: string;
}

interface Prepared {
  readonly plan: PlanInput;
  readonly routing: AiRouting;
  readonly main: Attempt;
}

/** L'utilisateur de l'appel, seulement s'il est connu (jamais de propriété indéfinie). */
const userOf = (request: AiRequest): { userId?: string } =>
  request.userId === undefined ? {} : { userId: request.userId };

/** Les champs absents ne sont pas transmis (jamais de propriété indéfinie). */
const llmRequestOf = (request: AiRequest, attempt: Attempt): LlmRequest => ({
  model: attempt.model,
  credential: attempt.credential,
  prompt: request.prompt,
  output: request.output,
  budget: request.budget,
  trace: request.trace,
  ...(attempt.baseUrl === undefined ? {} : { baseUrl: attempt.baseUrl }),
  ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  ...(request.signal === undefined ? {} : { signal: request.signal }),
});

/**
 * Moteur `AiProvider` : résout l'usage en fournisseur + modèle, refuse au plafond avant tout appel,
 * bascule une fois sur le secours, compte les jetons et le coût réels. Pur : tout passe par des ports.
 */
export class AiProviderRouter implements AiProvider {
  readonly #deps: AiProviderRouterDeps;

  constructor(deps: AiProviderRouterDeps) {
    this.#deps = deps;
  }

  /** État du plafond mensuel (`ok`, `warning`, `suspended`) ; TK-98 l'affichera. */
  async capState(organizationId: string): Promise<AiCapState> {
    const routing = await this.#deps.routing.load(organizationId);
    return capStateOf(await this.#deps.meter.month(organizationId), routing.monthlyCapMicroUsd);
  }

  async preflight(request: AiRequest): Promise<void> {
    await this.#prepare(request);
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    const { plan, main } = await this.#prepare(request);
    try {
      return await this.#complete(request, main);
    } catch (error) {
      const next = await this.#fallbackAfter(request, plan, main, error);
      if (next === undefined) {
        throw error;
      }
      return this.#complete(request, next);
    }
  }

  async *stream(request: AiRequest): AsyncGenerator<LlmStreamEvent> {
    if (request.output.kind !== "text") {
      throw new InvalidLlmRequestError("output");
    }
    const { plan, main } = await this.#prepare(request);
    let attempt = main;
    let started = false;
    for (let fellBack = false; ; fellBack = true) {
      try {
        for await (const event of this.#stream(request, attempt)) {
          started = true;
          yield event;
        }
        return;
      } catch (error) {
        const next =
          started || fellBack
            ? undefined
            : await this.#fallbackAfter(request, plan, attempt, error);
        if (next === undefined) {
          throw error;
        }
        attempt = next;
      }
    }
  }

  /** Réglages, plafond (refus avant tout réseau), puis première cible dont la clé se résout. */
  async #prepare(request: AiRequest): Promise<Prepared> {
    const { organizationId, usage, euOnly } = request;
    const routing = await this.#deps.routing.load(organizationId);
    const consumption = await this.#deps.meter.month(organizationId);
    const state = capStateOf(consumption, routing.monthlyCapMicroUsd);
    if (state === "suspended") {
      throw new AiCapReachedError();
    }
    if (state === "warning") {
      await this.#warn(request, consumption.warnedThisMonth);
    }
    const plan: PlanInput = { routing, catalog: this.#deps.catalog, usage, euOnly };
    for (const target of mainTargets(plan)) {
      const attempt = await this.#attemptOf(organizationId, target);
      if (attempt !== undefined) {
        return { plan, routing, main: attempt };
      }
    }
    throw new AiNotConfiguredError(notConfiguredReason(plan));
  }

  async #attemptOf(organizationId: string, target: Target): Promise<Attempt | undefined> {
    const resolved = await this.#deps.credentials.resolve(organizationId, target.provider);
    const model = target.model ?? resolved?.defaultModel ?? target.fallbackModel;
    if (resolved === undefined || model === undefined) {
      return undefined;
    }
    return {
      provider: target.provider,
      model,
      credential: resolved.credential,
      ...(resolved.baseUrl === undefined ? {} : { baseUrl: resolved.baseUrl }),
      ...(resolved.revision === undefined ? {} : { revision: resolved.revision }),
    };
  }

  /** Cible de secours si l'erreur le justifie ; journalise la bascule. Jamais sur annulation. */
  async #fallbackAfter(
    request: AiRequest,
    plan: PlanInput,
    failed: Attempt,
    error: unknown,
  ): Promise<Attempt | undefined> {
    const reason = fallbackReasonOf(error);
    const target = reason === undefined ? undefined : fallbackTarget(plan, failed.provider);
    if (reason === undefined || target === undefined || request.signal?.aborted) {
      return undefined;
    }
    const attempt = await this.#attemptOf(request.organizationId, target);
    if (attempt !== undefined) {
      await this.#emit({
        type: "llm.fallback",
        organizationId: request.organizationId,
        usage: request.usage,
        from: failed.provider,
        to: attempt.provider,
        reason,
        ...userOf(request),
      });
    }
    return attempt;
  }

  async #complete(request: AiRequest, attempt: Attempt): Promise<AiResponse> {
    const provider = this.#deps.providerFor(attempt.provider);
    let response: LlmResponse;
    try {
      response = await provider.complete(llmRequestOf(request, attempt));
    } catch (error) {
      await this.#reject(request, attempt, error);
      throw error;
    }
    await this.#count(request, attempt, response.model, response.usage);
    return { ...response, provider: attempt.provider };
  }

  async *#stream(request: AiRequest, attempt: Attempt): AsyncGenerator<LlmStreamEvent> {
    const provider = this.#deps.providerFor(attempt.provider);
    try {
      for await (const event of provider.stream(llmRequestOf(request, attempt))) {
        if (event.type === "end") {
          await this.#count(request, attempt, event.model, event.usage);
          yield { ...event, provider: attempt.provider };
        } else {
          yield event;
        }
      }
    } catch (error) {
      await this.#reject(request, attempt, error);
      throw error;
    }
  }

  /** Seul un 401 explicite rejette la clé ; un 403 ou un statut absent n'y touche pas. */
  async #reject(request: AiRequest, attempt: Attempt, error: unknown): Promise<void> {
    if (!(error instanceof LlmAuthError) || error.status !== 401) {
      return;
    }
    await this.#hook(() =>
      this.#deps.keys?.rejected({
        organizationId: request.organizationId,
        provider: attempt.provider,
        ...(attempt.revision === undefined ? {} : { revision: attempt.revision }),
        ...userOf(request),
      }),
    );
  }

  /** Meilleur effort : la panne d'un signalement ne change ni la réponse ni l'erreur. */
  async #hook(call: () => Promise<void> | undefined): Promise<void> {
    try {
      await call();
    } catch {
      // Journalisé par l'appelant s'il le souhaite ; jamais remonté.
    }
  }

  /** Coût réel au tarif du modèle servi ; la panne du compteur est rendue (le plafond reste fiable). */
  async #count(
    request: AiRequest,
    attempt: Attempt,
    servedModel: string,
    usage: { readonly inputTokens: number; readonly outputTokens: number },
  ): Promise<void> {
    const { organizationId } = request;
    await this.#deps.meter.record({
      organizationId,
      provider: attempt.provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costMicroUsd: actualCostMicroUsd(attempt.provider, servedModel, usage),
    });
    const routing = await this.#deps.routing.load(organizationId);
    const consumption = await this.#deps.meter.month(organizationId);
    if (capStateOf(consumption, routing.monthlyCapMicroUsd) !== "ok") {
      await this.#warn(request, consumption.warnedThisMonth);
    }
    await this.#hook(() => this.#deps.keys?.used({ organizationId, provider: attempt.provider }));
  }

  /** Alerte à 80 % : une fois par mois (marqueur atomique), au mieux (n'échoue jamais l'appel). */
  async #warn(request: AiRequest, alreadyWarned: boolean): Promise<void> {
    const { organizationId } = request;
    try {
      if (!alreadyWarned && (await this.#deps.meter.markCapWarned(organizationId))) {
        await this.#emit({ type: "ai.cap_warning", organizationId, ...userOf(request) });
      }
    } catch {
      // Le marqueur n'est pas posé : l'alerte sera retentée à l'appel suivant.
    }
  }

  async #emit(event: AiEvent): Promise<void> {
    try {
      await this.#deps.events.emit(event);
    } catch {
      // Un journal en panne ne bloque ni la bascule ni l'appel.
    }
  }
}
