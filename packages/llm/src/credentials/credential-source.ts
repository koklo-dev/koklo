import type { AiCredentialSource, LlmProviderId, ResolvedCredential } from "@koklo/domain";
import { assertSafeBaseUrl } from "../common/ssrf.ts";
import { LlmCredentialUnavailableError } from "./errors.ts";
import type { LlmCredentialResolver } from "./resolver.ts";

const isUnsafeBaseUrl = (error: unknown): boolean =>
  error instanceof Error && error.name === "UnsafeBaseUrlError";

/**
 * Seule porte de clé du moteur d'IA : adapte le résolveur (clé déchiffrée à la demande, opaque) au port
 * `AiCredentialSource`. Une clé absente, invalidée ou illisible, ou une adresse de base devenue dangereuse
 * (garde anti-SSRF rejouée à l'appel), donne « pas de clé » : le moteur passe au candidat suivant.
 * Toute autre erreur (base indisponible) remonte.
 */
export class ResolverCredentialSource implements AiCredentialSource {
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
