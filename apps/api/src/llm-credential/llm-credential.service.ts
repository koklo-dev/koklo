import type { LlmProviderId } from "@koklo/domain";
import { LLM_CREDENTIAL_MAX_LENGTH, llmCredential } from "@koklo/domain";
import { type Clock, systemClock } from "../clock.ts";
import type { TokenCipher } from "../crypto/token-cipher.ts";
import type { LlmCredentialRepository, LlmCredentialStatus } from "./llm-credential.repository.ts";
import { llmCredentialAad } from "./llm-credential-aad.ts";
import { EncryptionUnavailableError, LlmCredentialInputError } from "./llm-credential-errors.ts";

export interface SetLlmCredentialInput {
  readonly apiKey: string;
  readonly defaultModel?: string;
  readonly createdByUserId?: string;
}

/** Même borne que le CHECK SQL de `default_model`, comptée en points de code (`char_length`). */
const MODEL_MAX_LENGTH = 100;

/** Valide la clé avec la règle du domaine (celle des CHECK) ; l'erreur ne reprend jamais la valeur. */
function assertApiKey(apiKey: string): void {
  try {
    llmCredential(apiKey);
  } catch {
    // Cause écartée : seule la raison générale remonte.
    throw new LlmCredentialInputError(
      "apiKey",
      `1 à ${LLM_CREDENTIAL_MAX_LENGTH} caractères, sans caractère de contrôle`,
    );
  }
}

function assertModel(model: string): void {
  const length = [...model].length;
  if (length < 1 || length > MODEL_MAX_LENGTH || model.includes("/") || model.includes("..")) {
    throw new LlmCredentialInputError(
      "defaultModel",
      `1 à ${MODEL_MAX_LENGTH} caractères, sans « / » ni « .. »`,
    );
  }
}

/**
 * Gestion des clés BYOK d'une organisation. `cipher` null : aucun porte-clés configuré, `set` lève
 * `EncryptionUnavailableError` avant tout accès ; `list`, `remove` et `invalidate` fonctionnent.
 */
export class LlmCredentialService {
  constructor(
    private readonly repository: LlmCredentialRepository,
    private readonly cipher: TokenCipher | null,
    private readonly clock: Clock = systemClock,
  ) {}

  async set(
    organizationId: string,
    provider: LlmProviderId,
    input: SetLlmCredentialInput,
  ): Promise<LlmCredentialStatus> {
    if (this.cipher === null) throw new EncryptionUnavailableError();
    assertApiKey(input.apiKey);
    if (input.defaultModel !== undefined) assertModel(input.defaultModel);
    return this.repository.upsert(organizationId, {
      provider,
      secret: this.cipher.encrypt(input.apiKey, llmCredentialAad(organizationId, provider)),
      defaultModel: input.defaultModel ?? null,
      createdByUserId: input.createdByUserId ?? null,
      at: this.clock.now(),
    });
  }

  list(organizationId: string): Promise<LlmCredentialStatus[]> {
    return this.repository.list(organizationId);
  }

  remove(organizationId: string, provider: LlmProviderId): Promise<boolean> {
    return this.repository.remove(organizationId, provider);
  }

  invalidate(organizationId: string, provider: LlmProviderId): Promise<LlmCredentialStatus | null> {
    return this.repository.invalidate(organizationId, provider, this.clock.now());
  }

  markUsed(organizationId: string, provider: LlmProviderId): Promise<void> {
    return this.repository.markUsed(organizationId, provider, this.clock.now());
  }
}
