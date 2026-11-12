import { randomUUID } from "node:crypto";
import {
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type AiUsage,
  type FramedPrompt,
  type LlmCredential,
  type LlmOutputSpec,
  type LlmProviderId,
  type LlmResponse,
  type LlmServingProviderId,
  type LlmStopReason,
  type LlmUsage,
  type QualifiedModelCatalog,
  UntrustedDelimiterCollisionError,
  validateLlmOutput,
} from "@koklo/domain";
import { AiCapReachedError, AiNotConfiguredError } from "@koklo/llm";
import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { CredentialProbe } from "../llm-credential/credential-probe.ts";
import { LlmCredentialService } from "../llm-credential/llm-credential.service.ts";
import { LlmCredentialUnavailableError } from "../llm-credential/llm-credential-errors.ts";
import { PROJECT_POLICY, type ProjectPolicyStore } from "../project/project-policy.ts";
import { requestLogger } from "../request-logger.ts";
import type { AuditActor, AuditEntry } from "../tracker/audit.ts";
import { AI_BUDGETS, type AiPurpose } from "./ai-budget.ts";
import {
  capReached,
  errorNameOf,
  isRejectedKey,
  outputInvalid,
  portFailure,
  promptRejected,
  providerError,
  unavailableCredential,
} from "./ai-errors.ts";
import { ConcurrencyGate } from "./ai-gate.ts";
import { AiLedger, type QuotaKind } from "./ai-ledger.ts";
import { AI_ADAPTERS, AI_CATALOG, AI_PROVIDER, type AiAdapterFactory } from "./ai-tokens.ts";
import { NONCE_SOURCE, type NonceSource } from "./nonce.ts";

const TRACE_ID = /[^A-Za-z0-9._:-]/g;
const TRACE_ID_MAX = 64;

/** Identifiant de corrélation au motif du port (`[A-Za-z0-9._:-]{1,64}`), à défaut un UUID. */
export const correlationIdOf = (requestId: string): string =>
  requestId.replace(TRACE_ID, "").slice(0, TRACE_ID_MAX) || randomUUID();

/** Ce qui distingue un appel d'un autre ; le reste du pipeline est commun. */
interface AiCallBase<T> {
  readonly purpose: AiPurpose;
  readonly actor: AuditActor;
  /** Projet de l'appel : le moteur en lit `eu_only` (B304). Absent : appel d'organisation, jamais restreint à l'UE. */
  readonly projectId?: string;
  readonly correlationId: string;
  readonly quota: QuotaKind;
  readonly output: LlmOutputSpec;
  /** Cadre le prompt avec le nonce de l'appel ; la collision de délimiteur est levée ici. */
  readonly frame: (nonce: string) => FramedPrompt;
  /** Valide la réponse et en tire la sortie de la procédure (jamais appelé si le fournisseur échoue). */
  readonly settle: (response: AiResponse) => T;
}

/** Appel routé par le moteur : l'appelant donne un usage, jamais un fournisseur ni un modèle. */
export interface AiUsageCall<T> extends AiCallBase<T> {
  readonly usage: AiUsage;
  readonly entry: () => AuditEntry;
  /** Interrompt l'appel (annulation du client) ; le moteur le transmet à l'adaptateur. */
  readonly signal?: AbortSignal;
  /** L'appelant tient déjà un verrou exclusif en base : pas de sémaphore de processus (TK-90, B221). */
  readonly exclusive?: true;
  /** Un appel précédent du même échange a déjà été admis : ni quota, ni ligne d'audit en plus (TK-90, B220). */
  readonly admitted?: true;
}

/** Appel en flux de texte : mêmes refus, quota et audit qu'un appel `run`, sans `output` ni `settle`. */
export type AiStreamCall = Omit<AiUsageCall<never>, "output" | "settle">;

/** Admission seule (TK-99a) : le prompt ne sert qu'à l'examen du moteur, il n'est jamais envoyé. */
export type AiAdmitCall = Omit<AiUsageCall<never>, "output" | "settle">;

/** Fin d'un flux : ce que le fournisseur a réellement servi. */
export interface AiStreamEnd {
  readonly stop: LlmStopReason;
  readonly usage: LlmUsage;
  readonly provider: LlmServingProviderId;
  readonly model: string;
}

/** Vérification d'une clé : le fournisseur est nommé (il vient de l'URL), sans usage ni plafond. */
export interface AiVerifyCall<T> extends AiCallBase<T> {
  readonly provider: LlmProviderId;
  /** `credentialId` : la ligne de la clé résolue. */
  readonly entry: (credentialId: string) => AuditEntry;
}

/**
 * Test d'une clé AVANT tout enregistrement (écran des fournisseurs, TK-98) : la clé, l'adresse et le
 * modèle viennent de la saisie, rien n'est lu ni écrit en base (hors la ligne de quota).
 */
export interface AiProbeCall<T> extends AiCallBase<T> {
  readonly provider: LlmProviderId;
  readonly credential: LlmCredential;
  /** Adresse déjà normalisée et validée (anti-SSRF) ; `openai_compatible` seul. */
  readonly baseUrl?: string;
  /** Modèle saisi, sinon le premier modèle qualifié du fournisseur. */
  readonly model?: string;
  readonly entry: () => AuditEntry;
}

/** Cible d'un appel direct à un adaptateur (sans moteur : fournisseur et clé sont connus). */
interface DirectTarget {
  readonly provider: LlmProviderId;
  readonly model: string;
  readonly credential: LlmCredential;
  readonly baseUrl?: string;
}

/**
 * Pipeline commun des appels au modèle (`02-decisions-54b.md` §4) : refus préalable du moteur (plafond,
 * aucune clé) -> prompt (nonce neuf) -> sémaphore -> quota et audit AVANT l'appel -> appel -> validation.
 * Un refus avant l'audit n'écrit aucune ligne et ne consomme aucun quota. La vie des clés (dernier
 * usage, invalidation sur 401) est signalée par le moteur lui-même (`AiKeyHooks`).
 */
@Injectable()
export class AiCallRunner {
  readonly #gate: ConcurrencyGate;

  constructor(
    @Inject(AI_PROVIDER) private readonly engine: AiProvider,
    @Inject(AI_ADAPTERS) private readonly adapters: AiAdapterFactory,
    @Inject(AI_CATALOG) private readonly catalog: QualifiedModelCatalog,
    @Inject(CredentialProbe) private readonly keys: CredentialProbe,
    @Inject(LlmCredentialService) private readonly credentials: LlmCredentialService,
    @Inject(NONCE_SOURCE) private readonly nonces: NonceSource,
    @Inject(AiLedger) private readonly ledger: AiLedger,
    @Inject(PROJECT_POLICY) private readonly policy: ProjectPolicyStore,
  ) {
    this.#gate = new ConcurrencyGate(ledger.limits.maxConcurrentPerOrg);
  }

  async run<T>(call: AiUsageCall<T>): Promise<T> {
    const { organizationId } = call.actor;
    const request = await this.requestOf(call, call.output);
    await this.refusals(organizationId, () => this.engine.preflight(request));
    const release = call.exclusive ? () => undefined : this.#gate.acquire(organizationId);
    try {
      if (!call.admitted) await this.ledger.admit(call.actor, call.quota, call.entry());
      const response = await this.attempt(call, organizationId, () =>
        this.engine.complete(request),
      );
      return this.settle(call, response);
    } finally {
      release();
    }
  }

  /**
   * Flux de texte (TK-90) : cadrage, refus du moteur, quota et audit AVANT l'appel (donc en vraies erreurs), puis le
   * texte morceau par morceau ; la fin rend l'arrêt, l'usage et le modèle servi. Pas de sémaphore de processus :
   * l'appelant tient un verrou en base. Les erreurs du milieu du flux sont les mêmes erreurs typées.
   */
  async stream(call: AiStreamCall): Promise<AsyncGenerator<string, AiStreamEnd | undefined>> {
    const request = await this.requestOf(call, { kind: "text" });
    await this.refusals(call.actor.organizationId, () => this.engine.preflight(request));
    if (!call.admitted) await this.ledger.admit(call.actor, call.quota, call.entry());
    return this.relay(call, request);
  }

  /**
   * Refus du moteur (plafond, aucune clé), quota et audit AVANT un travail confié à une tâche de fond (TK-99a) : aucun
   * appel au modèle ici, la tâche fait les siens. Mêmes erreurs typées qu'un appel `run`.
   */
  async admit(call: AiAdmitCall): Promise<void> {
    const request = await this.requestOf(call, { kind: "text" });
    await this.refusals(call.actor.organizationId, () => this.engine.preflight(request));
    await this.ledger.admit(call.actor, call.quota, call.entry());
  }

  async verify<T>(call: AiVerifyCall<T>): Promise<T> {
    const resolved = await this.open(call.actor.organizationId, call.provider);
    const model = this.modelFor(call.provider, resolved.defaultModel ?? undefined);
    const target: DirectTarget = {
      provider: call.provider,
      model,
      credential: resolved.credential,
      ...(resolved.baseUrl === undefined ? {} : { baseUrl: resolved.baseUrl }),
    };
    const response = await this.exchange(call, target, call.entry(resolved.credentialId), () =>
      this.invalidate(call, resolved.revision),
    );
    await this.markUsed(call);
    return this.settle(call, { ...response, provider: call.provider });
  }

  async probe<T>(call: AiProbeCall<T>): Promise<T> {
    const target: DirectTarget = {
      provider: call.provider,
      model: this.modelFor(call.provider, call.model),
      credential: call.credential,
      ...(call.baseUrl === undefined ? {} : { baseUrl: call.baseUrl }),
    };
    const response = await this.exchange(call, target, call.entry());
    return this.settle(call, { ...response, provider: call.provider });
  }

  /** Données en UE du projet de l'appel ; sans projet, aucune restriction. */
  private euOnlyOf(call: Pick<AiUsageCall<unknown>, "actor" | "projectId">): Promise<boolean> {
    const projectId = call.projectId ?? call.actor.projectId;
    return projectId === undefined
      ? Promise.resolve(false)
      : this.policy.euOnly(call.actor.organizationId, projectId);
  }

  private async requestOf(
    call: Pick<
      AiUsageCall<unknown>,
      "actor" | "projectId" | "usage" | "purpose" | "correlationId" | "frame" | "signal"
    >,
    output: LlmOutputSpec,
  ): Promise<AiRequest> {
    return {
      organizationId: call.actor.organizationId,
      userId: call.actor.userId,
      usage: call.usage,
      euOnly: await this.euOnlyOf(call),
      prompt: this.frame(call),
      output,
      budget: AI_BUDGETS[call.purpose],
      trace: { purpose: call.purpose, correlationId: call.correlationId },
      ...(call.signal === undefined ? {} : { signal: call.signal }),
    };
  }

  private async *relay(
    call: AiStreamCall,
    request: AiRequest,
  ): AsyncGenerator<string, AiStreamEnd | undefined> {
    let end: AiStreamEnd | undefined;
    try {
      for await (const event of this.engine.stream(request)) {
        if (event.type === "text") yield event.text;
        else
          end = {
            stop: event.stop,
            usage: event.usage,
            provider: event.provider,
            model: event.model,
          };
      }
    } catch (error) {
      this.logFailure(call, error);
      throw await this.translated(call.actor.organizationId, error);
    }
    if (end?.stop === "refusal") throw providerError("refused");
    return end;
  }

  /** Modèle demandé, sinon le premier qualifié du fournisseur ; aucun -> `unavailable` (rien d'envoyé). */
  private modelFor(provider: LlmProviderId, requested: string | undefined): string {
    const model =
      requested ?? this.catalog.list().find((entry) => entry.provider === provider)?.model;
    if (model === undefined) throw providerError("unavailable");
    return model;
  }

  /**
   * Un échange direct avec l'adaptateur du fournisseur : prompt -> sémaphore -> quota et audit AVANT
   * l'appel -> appel. `rejected` s'exécute sur un 401 (invalidation de la clé en base, pour `verify`).
   */
  private async exchange(
    call: AiCallBase<unknown> & { readonly provider: LlmProviderId },
    target: DirectTarget,
    entry: AuditEntry,
    rejected?: () => Promise<void>,
  ): Promise<LlmResponse> {
    const { organizationId } = call.actor;
    const adapter = this.adapters(call.provider);
    const prompt = this.frame(call);
    const release = this.#gate.acquire(organizationId);
    try {
      await this.ledger.admit(call.actor, call.quota, entry);
      return await this.attempt(call, organizationId, async () => {
        try {
          return await adapter.complete({
            model: target.model,
            credential: target.credential,
            ...(target.baseUrl === undefined ? {} : { baseUrl: target.baseUrl }),
            prompt,
            output: call.output,
            budget: AI_BUDGETS[call.purpose],
            trace: { purpose: call.purpose, correlationId: call.correlationId },
          });
        } catch (error) {
          if (isRejectedKey(error)) await rejected?.();
          throw error;
        }
      });
    } finally {
      release();
    }
  }

  private async open(organizationId: string, provider: LlmProviderId) {
    try {
      return await this.keys.open(organizationId, provider);
    } catch (error) {
      if (error instanceof LlmCredentialUnavailableError) throw unavailableCredential(error.reason);
      throw error;
    }
  }

  private frame(call: Pick<AiCallBase<unknown>, "frame">): FramedPrompt {
    try {
      return call.frame(this.nonces.next());
    } catch (error) {
      // Rang seulement : jamais le contenu fautif.
      if (error instanceof UntrustedDelimiterCollisionError) throw promptRejected(error.index);
      throw error;
    }
  }

  /** Refus du moteur (plafond, aucune clé utilisable) rendus comme erreurs typées du contrat. */
  private async refusals<R>(organizationId: string, work: () => Promise<R>): Promise<R> {
    try {
      return await work();
    } catch (error) {
      throw await this.refusalOf(organizationId, error);
    }
  }

  private async refusalOf(organizationId: string, error: unknown): Promise<unknown> {
    if (error instanceof AiCapReachedError) return capReached();
    if (error instanceof AiNotConfiguredError) {
      return unavailableCredential(await this.credentials.unavailabilityOf(organizationId));
    }
    return error;
  }

  /** Erreur du flux vers l'erreur typée du contrat : refus du moteur, sinon erreur du port. */
  private async translated(organizationId: string, error: unknown): Promise<unknown> {
    const refusal = await this.refusalOf(organizationId, error);
    return isTypedRefusal(refusal) ? refusal : portFailure(refusal);
  }

  private async attempt<R extends LlmResponse>(
    call: AiCallBase<unknown>,
    organizationId: string,
    work: () => Promise<R>,
  ): Promise<R> {
    const started = Date.now();
    try {
      const response = await this.refusals(organizationId, work);
      requestLogger().info(
        {
          event: "llm.complete",
          purpose: call.purpose,
          correlationId: call.correlationId,
          provider: response.provider,
          model: response.model,
          durationMs: Date.now() - started,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
        "llm call",
      );
      return response;
    } catch (error) {
      this.logFailure(call, error);
      throw isTypedRefusal(error) ? error : portFailure(error);
    }
  }

  /** Compare-and-swap : une clé remplacée pendant l'appel (autre révision) n'est pas invalidée. */
  private async invalidate(call: AiVerifyCall<unknown>, revision: string): Promise<void> {
    try {
      await this.credentials.invalidate(
        call.actor.organizationId,
        call.provider,
        call.actor,
        revision,
      );
    } catch (error) {
      requestLogger().warn(
        { event: "llm.invalidate_failed", purpose: call.purpose, errorName: errorNameOf(error) },
        "llm key invalidation failed",
      );
    }
  }

  /** `verify` ne passe pas par le moteur : sa clé est marquée utilisée ici, au mieux. */
  private async markUsed(call: AiVerifyCall<unknown>): Promise<void> {
    try {
      await this.credentials.markUsed(call.actor.organizationId, call.provider);
    } catch (error) {
      requestLogger().warn(
        { event: "llm.mark_used_failed", purpose: call.purpose, errorName: errorNameOf(error) },
        "llm key usage not recorded",
      );
    }
  }

  private settle<T>(call: AiCallBase<T>, response: AiResponse): T {
    try {
      return call.settle(response);
    } catch (error) {
      this.logFailure(call, error);
      throw error;
    }
  }

  private logFailure(
    call: Pick<AiCallBase<unknown>, "purpose" | "correlationId">,
    error: unknown,
  ): void {
    const status = (error as { status?: unknown }).status;
    requestLogger().warn(
      {
        event: "llm.failed",
        purpose: call.purpose,
        correlationId: call.correlationId,
        errorName: errorNameOf(error),
        ...(typeof status === "number" ? { status } : {}),
      },
      "llm call failed",
    );
  }
}

const isTypedRefusal = (error: unknown): boolean => error instanceof ORPCError;

/** Sortie du modèle : `validateLlmOutput` puis `parse` strict ; toute erreur devient `LLM_OUTPUT_INVALID`. */
export function validated<T>(response: LlmResponse, parse: (raw: unknown) => T): T {
  if (response.stop !== "end") {
    // Sortie tronquée ou arrêtée par une séquence : jamais analysée.
    throw response.stop === "refusal" ? providerError("refused") : outputInvalid();
  }
  try {
    return validateLlmOutput(response.output, parse).value;
  } catch {
    throw outputInvalid();
  }
}
