import type { LlmCredential, LlmProviderId } from "@koklo/domain";
import type { TokenCipher } from "../crypto/token-cipher.ts";
import type { LlmCredentialRepository } from "./llm-credential.repository.ts";

export interface ResolvedLlmCredential {
  readonly credential: LlmCredential;
  readonly defaultModel: string | undefined;
}

/** Squelette du Red (TK-52a). Ordre des refus : missing, invalidated, no-encryption-key, undecryptable. */
export class LlmCredentialResolver {
  constructor(
    protected readonly repository: LlmCredentialRepository,
    protected readonly cipher: TokenCipher | null,
  ) {}

  resolve(_organizationId: string, _provider: LlmProviderId): Promise<ResolvedLlmCredential> {
    return Promise.reject(new Error("not implemented"));
  }
}
