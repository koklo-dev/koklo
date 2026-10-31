import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement AES-256-GCM des jetons utilisateur (ADR 0009). Module pur : ni environnement, ni
 * journal. Aucune erreur ne porte de clair, de clé ni de données associées.
 */
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const VARIABLE = "KOKLO_ENCRYPTION_KEY";
/** Valeur générée par l'infra (`generate` du manifeste) : 32 lettres et chiffres, utilisés tels quels. */
const INFRA_GENERATED = /^[A-Za-z0-9]{32}$/;

export class InvalidEncryptionKeyError extends Error {
  constructor() {
    super(
      `${VARIABLE} invalide : attendu 32 octets en base64 (openssl rand -base64 32) ou 32 caractères alphanumériques.`,
    );
    this.name = "InvalidEncryptionKeyError";
  }
}

export class TokenDecryptionError extends Error {
  constructor() {
    super("Jeton chiffré illisible : altéré, ou chiffré avec une autre clé ou d'autres données.");
    this.name = "TokenDecryptionError";
  }
}

/** Valeur stockée : `ciphertext` = octets chiffrés suivis du tag GCM de 16 octets. */
export interface EncryptedSecret {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly keyVersion: number;
}

export interface TokenCipher {
  readonly keyVersion: number;
  encrypt(plaintext: string, aad: string): EncryptedSecret;
  decrypt(secret: EncryptedSecret, aad: string): string;
}

/**
 * Lit `KOKLO_ENCRYPTION_KEY` : 32 octets en base64 (`openssl rand -base64 32`), ou les 32
 * caractères alphanumériques que génère l'infra, lus comme 32 octets.
 */
export function parseEncryptionKey(value: string): Buffer {
  if (INFRA_GENERATED.test(value)) return Buffer.from(value, "utf8");
  const key = Buffer.from(value, "base64");
  // Le décodage de Node tolère tout : seul un aller-retour exact prouve du base64 canonique.
  if (key.length !== KEY_BYTES || key.toString("base64") !== value) {
    throw new InvalidEncryptionKeyError();
  }
  return key;
}

export function createTokenCipher(key: Buffer, options: { keyVersion?: number } = {}): TokenCipher {
  if (key.length !== KEY_BYTES) throw new InvalidEncryptionKeyError();
  const keyVersion = options.keyVersion ?? 1;
  return {
    keyVersion,
    encrypt(plaintext, aad) {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, nonce);
      cipher.setAAD(Buffer.from(aad, "utf8"));
      const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return { ciphertext: Buffer.concat([body, cipher.getAuthTag()]), nonce, keyVersion };
    },
    decrypt(secret, aad) {
      if (
        secret.keyVersion !== keyVersion ||
        secret.nonce.length !== NONCE_BYTES ||
        secret.ciphertext.length <= TAG_BYTES
      ) {
        throw new TokenDecryptionError();
      }
      try {
        const decipher = createDecipheriv(ALGORITHM, key, secret.nonce);
        decipher.setAAD(Buffer.from(aad, "utf8"));
        decipher.setAuthTag(secret.ciphertext.subarray(-TAG_BYTES));
        const body = secret.ciphertext.subarray(0, -TAG_BYTES);
        return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
      } catch {
        // Cause volontairement écartée : elle peut citer des octets du message.
        throw new TokenDecryptionError();
      }
    },
  };
}
