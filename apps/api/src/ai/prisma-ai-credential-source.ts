import type { AiCredentialSource, LlmProviderId, ResolvedCredential } from "@koklo/domain";
import { assertSafeBaseUrl } from "@koklo/llm";
import type { LlmCredentialResolver } from "../llm-credential/llm-credential.resolver.ts";
import { LlmCredentialUnavailableError } from "../llm-credential/llm-credential-errors.ts";

/**
 * Seule porte de clé du moteur d'IA : adapte le résolveur (clé déchiffrée à la demande, opaque) au port
 * `AiCredentialSource`. Une clé absente, invalidée ou illisible, ou une adresse de base devenue dangereuse
 * (garde anti-SSRF rejouée à l'appel), donne « pas de clé » : le moteur passe au candidat suivant.
 * Toute autre erreur (base indisponible) remonte.
 */
export class PrismaAiCredentialSource implements AiCredentialSource {
  constructor(private readonly resolver: LlmCredentialResolver) {}

  async resolve(
    organizationId: string,
    provider: LlmProviderId,
  ): Promise<ResolvedCredential | undefined> {
    try {
      const resolved = await this.resolver.resolve(organizationId, provider);
      if (resolved.baseUrl !== undefined) assertSafeBaseUrl(resolved.baseUrl);
      return {
        credential: resolved.credential,
        ...(resolved.baseUrl === undefined ? {} : { baseUrl: resolved.baseUrl }),
        ...(resolved.defaultModel === undefined ? {} : { defaultModel: resolved.defaultModel }),
        revision: resolved.revision,
      };
    } catch (error) {
      if (error instanceof LlmCredentialUnavailableError || isUnsafeBaseUrl(error)) {
        return undefined;
      }
      throw error;
    }
  }
}

const isUnsafeBaseUrl = (error: unknown): boolean =>
  error instanceof Error && error.name === "UnsafeBaseUrlError";
