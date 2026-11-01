import { randomUUID } from "node:crypto";
import {
  type FramedPrompt,
  type LlmOutputSpec,
  type LlmProvider,
  type LlmProviderId,
  type LlmResponse,
  UntrustedDelimiterCollisionError,
  validateLlmOutput,
} from "@koklo/domain";
import { ANTHROPIC_DEFAULT_MODEL } from "@koklo/llm";
import { Inject, Injectable } from "@nestjs/common";
import { LLM_PROVIDERS, type LlmProviderRegistry } from "../llm/tokens.ts";
import {
  LlmCredentialResolver,
  type ResolvedLlmCredential,
} from "../llm-credential/llm-credential.resolver.ts";
import { LlmCredentialService } from "../llm-credential/llm-credential.service.ts";
import { LlmCredentialUnavailableError } from "../llm-credential/llm-credential-errors.ts";
import { requestLogger } from "../request-logger.ts";
import type { AuditActor, AuditEntry } from "../tracker/audit.ts";
import { AI_BUDGETS, type AiPurpose } from "./ai-budget.ts";
import {
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
import { NONCE_SOURCE, type NonceSource } from "./nonce.ts";

/** Modèle servi par défaut, par fournisseur disposant d'un adaptateur (sans `defaultModel` BYOK). */
const DEFAULT_MODELS: Partial<Record<LlmProviderId, string>> = {
  anthropic: ANTHROPIC_DEFAULT_MODEL,
};

const TRACE_ID = /[^A-Za-z0-9._:-]/g;
const TRACE_ID_MAX = 64;

/** Identifiant de corrélation au motif du port (`[A-Za-z0-9._:-]{1,64}`), à défaut un UUID. */
export const correlationIdOf = (requestId: string): string =>
  requestId.replace(TRACE_ID, "").slice(0, TRACE_ID_MAX) || randomUUID();

/** Ce qui distingue un appel d'un autre ; le reste du pipeline est commun (`AiCallRunner.run`). */
export interface AiCall<T> {
  readonly purpose: AiPurpose;
  readonly provider: LlmProviderId;
  readonly actor: AuditActor;
  readonly correlationId: string;
  readonly quota: QuotaKind;
  readonly output: LlmOutputSpec;
  /** Cadre le prompt avec le nonce de l'appel ; la collision de délimiteur est levée ici. */
  readonly frame: (nonce: string) => FramedPrompt;
  /** Ligne d'audit de l'appel ; `credentialId` : la ligne de la clé résolue. */
  readonly entry: (credentialId: string) => AuditEntry;
  /** Valide la réponse et en tire la sortie de la procédure (jamais appelé si le fournisseur échoue). */
  readonly settle: (response: LlmResponse) => T;
}

/**
 * Pipeline commun des appels au modèle (`02-decisions-54b.md` §4) : clé -> adaptateur -> prompt
 * (nonce neuf) -> sémaphore -> quota et audit AVANT l'appel -> appel -> `markUsed` -> validation.
 * Un refus avant l'audit n'écrit aucune ligne et ne consomme aucun quota.
 */
@Injectable()
export class AiCallRunner {
  readonly #gate: ConcurrencyGate;

  constructor(
    @Inject(LlmCredentialResolver) private readonly resolver: LlmCredentialResolver,
    @Inject(LlmCredentialService) private readonly credentials: LlmCredentialService,
    @Inject(LLM_PROVIDERS) private readonly registry: LlmProviderRegistry,
    @Inject(NONCE_SOURCE) private readonly nonces: NonceSource,
    @Inject(AiLedger) private readonly ledger: AiLedger,
  ) {
    this.#gate = new ConcurrencyGate(ledger.limits.maxConcurrentPerOrg);
  }

  async run<T>(call: AiCall<T>): Promise<T> {
    const { organizationId } = call.actor;
    const resolved = await this.resolve(organizationId, call.provider);
    const adapter = this.registry.get(call.provider);
    const model = resolved.defaultModel ?? DEFAULT_MODELS[call.provider];
    if (adapter === undefined || model === undefined) throw providerError("unavailable");
    const prompt = this.frame(call);
    const release = this.#gate.acquire(organizationId);
    try {
      await this.ledger.admit(call.actor, call.quota, call.entry(resolved.credentialId));
      const response = await this.complete(call, adapter, { resolved, model, prompt });
      await this.markUsed(call);
      return this.settle(call, response);
    } finally {
      release();
    }
  }

  private async resolve(
    organizationId: string,
    provider: LlmProviderId,
  ): Promise<ResolvedLlmCredential> {
    try {
      return await this.resolver.resolve(organizationId, provider);
    } catch (error) {
      if (error instanceof LlmCredentialUnavailableError) throw unavailableCredential(error.reason);
      throw error;
    }
  }

  private frame(call: AiCall<unknown>): FramedPrompt {
    try {
      return call.frame(this.nonces.next());
    } catch (error) {
      // Rang seulement : jamais le contenu fautif.
      if (error instanceof UntrustedDelimiterCollisionError) throw promptRejected(error.index);
      throw error;
    }
  }

  private async complete(
    call: AiCall<unknown>,
    adapter: LlmProvider,
    sent: { resolved: ResolvedLlmCredential; model: string; prompt: FramedPrompt },
  ): Promise<LlmResponse> {
    const started = Date.now();
    try {
      const response = await adapter.complete({
        model: sent.model,
        credential: sent.resolved.credential,
        prompt: sent.prompt,
        output: call.output,
        budget: AI_BUDGETS[call.purpose],
        trace: { purpose: call.purpose, correlationId: call.correlationId },
      });
      requestLogger().info(
        {
          event: "llm.complete",
          purpose: call.purpose,
          correlationId: call.correlationId,
          provider: call.provider,
          model: response.model,
          durationMs: Date.now() - started,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
        "llm call",
      );
      return response;
    } catch (error) {
      if (isRejectedKey(error)) await this.invalidate(call, sent.resolved.revision);
      this.logFailure(call, error);
      throw portFailure(error);
    }
  }

  /** Compare-and-swap : une clé remplacée pendant l'appel (autre révision) n'est pas invalidée. */
  private async invalidate(call: AiCall<unknown>, revision: string): Promise<void> {
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

  /** Meilleur effort : un échec est journalisé par nom d'erreur seulement, la réponse est inchangée. */
  private async markUsed(call: AiCall<unknown>): Promise<void> {
    try {
      await this.credentials.markUsed(call.actor.organizationId, call.provider);
    } catch (error) {
      requestLogger().warn(
        { event: "llm.mark_used_failed", purpose: call.purpose, errorName: errorNameOf(error) },
        "llm key usage not recorded",
      );
    }
  }

  private settle<T>(call: AiCall<T>, response: LlmResponse): T {
    try {
      return call.settle(response);
    } catch (error) {
      this.logFailure(call, error);
      throw error;
    }
  }

  private logFailure(call: AiCall<unknown>, error: unknown): void {
    const status = (error as { status?: unknown }).status;
    requestLogger().warn(
      {
        event: "llm.failed",
        purpose: call.purpose,
        correlationId: call.correlationId,
        provider: call.provider,
        errorName: errorNameOf(error),
        ...(typeof status === "number" ? { status } : {}),
      },
      "llm call failed",
    );
  }
}

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
