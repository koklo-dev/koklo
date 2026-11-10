import type { GitUserCredentials } from "@koklo/domain";
import { type EncryptedSecret, type TokenCipher, TokenDecryptionError } from "./token-cipher.ts";

/**
 * Forme stockée des jetons utilisateur du fournisseur (ADR 0009) : seule la part secrète est
 * chiffrée, les échéances restent lisibles en base. Partagée par l'API (qui les écrit) et le worker
 * (qui les lit pour créer un dépôt sur un compte personnel). Pure : aucune base, aucun journal.
 */
type SecretPart = { token: string; refreshToken?: string };

/** Les données associées lient le chiffré à son utilisateur et à son installation. */
export const credentialsAadOf = (userId: string, installationId: string): string =>
  `${userId}:${installationId}`;

/** Le clair a passé l'authentification GCM : s'il n'a pas la forme écrite, c'est une corruption. Aucune citation du contenu. */
function parseSecretPart(plaintext: string): SecretPart {
  try {
    const part = JSON.parse(plaintext) as Partial<SecretPart> | null;
    if (typeof part?.token === "string") return part as SecretPart;
  } catch {
    // SyntaxError écartée : son message cite le début du clair.
  }
  throw new TokenDecryptionError();
}

/** Ligne `provider_user_credentials` telle que lue en base. */
export interface StoredCredentialRow {
  ciphertext: Uint8Array<ArrayBuffer>;
  nonce: Uint8Array<ArrayBuffer>;
  keyVersion: number;
  expiresAt: Date;
  refreshExpiresAt: Date | null;
}

/** Déchiffre une ligne ; un enregistrement illisible lève `TokenDecryptionError` (jamais « absent »). */
export function openUserCredentials(
  cipher: TokenCipher,
  userId: string,
  installationId: string,
  row: StoredCredentialRow,
): GitUserCredentials {
  const secret: EncryptedSecret = {
    ciphertext: Buffer.from(row.ciphertext),
    nonce: Buffer.from(row.nonce),
    keyVersion: row.keyVersion,
  };
  const { token, refreshToken } = parseSecretPart(
    cipher.decrypt(secret, credentialsAadOf(userId, installationId)),
  );
  return {
    token,
    expiresAt: row.expiresAt.toISOString(),
    ...(refreshToken === undefined ? {} : { refreshToken }),
    ...(row.refreshExpiresAt === null
      ? {}
      : { refreshExpiresAt: row.refreshExpiresAt.toISOString() }),
  };
}

/** Colonnes à écrire pour des identifiants : chiffré, nonce, version de clé et échéances. */
export function sealUserCredentials(
  cipher: TokenCipher,
  userId: string,
  installationId: string,
  credentials: GitUserCredentials,
): StoredCredentialRow {
  const part: SecretPart = {
    token: credentials.token,
    ...(credentials.refreshToken === undefined ? {} : { refreshToken: credentials.refreshToken }),
  };
  const sealed = cipher.encrypt(JSON.stringify(part), credentialsAadOf(userId, installationId));
  return {
    ciphertext: new Uint8Array(sealed.ciphertext),
    nonce: new Uint8Array(sealed.nonce),
    keyVersion: sealed.keyVersion,
    expiresAt: new Date(credentials.expiresAt),
    refreshExpiresAt:
      credentials.refreshExpiresAt === undefined ? null : new Date(credentials.refreshExpiresAt),
  };
}
