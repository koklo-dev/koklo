import { type LlmCredential, type LlmProviderId, llmCredential } from "@koklo/domain";
import type { TokenCipher } from "../crypto/token-cipher.ts";
import type { LlmCredentialRepository } from "./llm-credential.repository.ts";
import { llmCredentialAad } from "./llm-credential-aad.ts";
import { LlmCredentialUnavailableError } from "./llm-credential-errors.ts";

export interface ResolvedLlmCredential {
  readonly credential: LlmCredential;
  readonly defaultModel: string | undefined;
  /**
   * Révision de la clé stockée (hex du nonce AES-GCM, neuf à chaque `set`) : sert de compare-and-swap
   * à `invalidate` (D7, TK-54b). Squelette RED : vide tant que le Green ne la renseigne pas.
   */
  readonly revision: string;
}

/**
 * Rend la clé BYOK d'une organisation sous forme de `LlmCredential` opaque, avec son modèle par
 * défaut. Ordre des refus : `missing`, `invalidated`, `no-encryption-key`, `undecryptable`. Ne
 * touche pas `last_used_at` (l'appelant le fait après un appel réussi, via `markUsed`).
 */
export class LlmCredentialResolver {
  constructor(
    private readonly repository: LlmCredentialRepository,
    private readonly cipher: TokenCipher | null,
  ) {}

  async resolve(organizationId: string, provider: LlmProviderId): Promise<ResolvedLlmCredential> {
    const stored = await this.repository.find(organizationId, provider);
    if (stored === null) throw new LlmCredentialUnavailableError("missing");
    if (stored.invalidatedAt !== null) throw new LlmCredentialUnavailableError("invalidated");
    if (this.cipher === null) throw new LlmCredentialUnavailableError("no-encryption-key");
    try {
      const secret = this.cipher.decrypt(stored.secret, llmCredentialAad(organizationId, provider));
      return {
        credential: llmCredential(secret),
        defaultModel: stored.defaultModel ?? undefined,
        revision: "",
      };
    } catch {
      // Version inconnue, autre clé ou AAD, chiffré altéré, ou clair que le domaine refuse : toute
      // cause est écartée, elle pourrait citer des octets du message.
      throw new LlmCredentialUnavailableError("undecryptable");
    }
  }
}
