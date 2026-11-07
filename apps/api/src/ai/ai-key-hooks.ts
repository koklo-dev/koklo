import type { AiKeyHooks, LlmProviderId } from "@koklo/domain";
import { Inject, Injectable } from "@nestjs/common";
import { LlmCredentialService } from "../llm-credential/llm-credential.service.ts";
import { requestLogger } from "../request-logger.ts";
import { errorNameOf } from "./ai-errors.ts";

/**
 * Vie des clés signalée par le moteur : dernier usage après un appel réussi, invalidation sur un 401
 * explicite. L'invalidation est un compare-and-swap (D7) : une clé remplacée pendant l'appel (autre
 * révision) n'est pas invalidée. L'utilisateur de l'appel signe l'audit ; sans lui, rien n'est audité.
 */
@Injectable()
export class CredentialKeyHooks implements AiKeyHooks {
  constructor(@Inject(LlmCredentialService) private readonly credentials: LlmCredentialService) {}

  /** Meilleur effort : un échec est journalisé par nom d'erreur seulement, la réponse est inchangée. */
  async used(event: { organizationId: string; provider: LlmProviderId }): Promise<void> {
    try {
      await this.credentials.markUsed(event.organizationId, event.provider);
    } catch (error) {
      requestLogger().warn(
        { event: "llm.mark_used_failed", errorName: errorNameOf(error) },
        "llm key usage not recorded",
      );
    }
  }

  async rejected(event: {
    organizationId: string;
    provider: LlmProviderId;
    revision?: string;
    userId?: string;
  }): Promise<void> {
    const actor =
      event.userId === undefined
        ? undefined
        : { organizationId: event.organizationId, userId: event.userId };
    try {
      await this.credentials.invalidate(
        event.organizationId,
        event.provider,
        actor,
        event.revision,
      );
    } catch (error) {
      requestLogger().warn(
        { event: "llm.invalidate_failed", errorName: errorNameOf(error) },
        "llm key invalidation failed",
      );
    }
  }
}
