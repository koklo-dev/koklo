import type { LlmProviderId } from "@koklo/domain";
import { type Clock, systemClock } from "../clock.ts";
import type { TokenCipher } from "../crypto/token-cipher.ts";
import type { LlmCredentialRepository, LlmCredentialStatus } from "./llm-credential.repository.ts";

export interface SetLlmCredentialInput {
  readonly apiKey: string;
  readonly defaultModel?: string;
  readonly createdByUserId?: string;
}

/**
 * Squelette du Red (TK-52a). `cipher` null : aucun porte-clés configuré (`set` lève
 * `EncryptionUnavailableError`, `list`/`remove`/`invalidate` fonctionnent).
 */
export class LlmCredentialService {
  constructor(
    protected readonly repository: LlmCredentialRepository,
    protected readonly cipher: TokenCipher | null,
    protected readonly clock: Clock = systemClock,
  ) {}

  set(
    _organizationId: string,
    _provider: LlmProviderId,
    _input: SetLlmCredentialInput,
  ): Promise<LlmCredentialStatus> {
    return Promise.reject(new Error("not implemented"));
  }
  list(_organizationId: string): Promise<LlmCredentialStatus[]> {
    return Promise.reject(new Error("not implemented"));
  }
  remove(_organizationId: string, _provider: LlmProviderId): Promise<boolean> {
    return Promise.reject(new Error("not implemented"));
  }
  invalidate(
    _organizationId: string,
    _provider: LlmProviderId,
  ): Promise<LlmCredentialStatus | null> {
    return Promise.reject(new Error("not implemented"));
  }
  markUsed(_organizationId: string, _provider: LlmProviderId): Promise<void> {
    return Promise.reject(new Error("not implemented"));
  }
}
