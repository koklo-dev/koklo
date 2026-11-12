import { type LlmCredential, type LlmProviderId, llmCredential } from "@koklo/domain";
import { llmCredentialAad } from "./aad.ts";
import { LlmCredentialUnavailableError } from "./errors.ts";

/** Valeur chiffrée stockée (forme de `EncryptedSecret` de `@koklo/github`, sans en dépendre). */
export interface StoredSecret {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly keyVersion: number;
}

/** Porte-clés, typé structurellement : `TokenCipher` de `@koklo/github` y satisfait. */
export interface CredentialCipher {
  decrypt(secret: StoredSecret, aad: string): string;
}

/** Ligne chiffrée d'une clé BYOK, telle que le dépôt la rend au résolveur. */
export interface StoredCredential {
  readonly id: string;
  readonly secret: StoredSecret;
  readonly defaultModel: string | null;
  readonly baseUrl: string | null;
  readonly invalidatedAt: string | null;
  /** Hex du nonce AES-GCM, neuf à chaque écriture de la clé. */
  readonly revision: string;
}

/** Port de lecture des clés (organisation en premier argument) : le dépôt de l'API et celui du worker le remplissent. */
export interface CredentialLookup {
  find(organizationId: string, provider: LlmProviderId): Promise<StoredCredential | null>;
}

export interface ResolvedLlmCredential {
  /** Identifiant de la ligne de la clé : cible de l'audit de `llmCredential.verify`. */
  readonly credentialId: string;
  readonly credential: LlmCredential;
  readonly defaultModel: string | undefined;
  /** Adresse de base du point d'accès compatible (déjà enregistrée sous garde anti-SSRF). */
  readonly baseUrl: string | undefined;
  /**
   * Révision de la clé stockée (hex du nonce AES-GCM, neuf à chaque `set`) : sert de compare-and-swap
   * à `invalidate` (D7, TK-54b). Sans lien avec la valeur de la clé.
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
    private readonly repository: CredentialLookup,
    private readonly cipher: CredentialCipher | null,
  ) {}

  async resolve(organizationId: string, provider: LlmProviderId): Promise<ResolvedLlmCredential> {
    const stored = await this.repository.find(organizationId, provider);
    if (stored === null) throw new LlmCredentialUnavailableError("missing");
    if (stored.invalidatedAt !== null) throw new LlmCredentialUnavailableError("invalidated");
    if (this.cipher === null) throw new LlmCredentialUnavailableError("no-encryption-key");
    try {
      const secret = this.cipher.decrypt(stored.secret, llmCredentialAad(organizationId, provider));
      return {
        credentialId: stored.id,
        credential: llmCredential(secret),
        defaultModel: stored.defaultModel ?? undefined,
        baseUrl: stored.baseUrl ?? undefined,
        revision: stored.revision,
      };
    } catch {
      // Version inconnue, autre clé ou AAD, chiffré altéré, ou clair que le domaine refuse : toute
      // cause est écartée, elle pourrait citer des octets du message.
      throw new LlmCredentialUnavailableError("undecryptable");
    }
  }
}
