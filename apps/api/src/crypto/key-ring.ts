import { createTokenCipher, type TokenCipher, TokenDecryptionError } from "./token-cipher.ts";

/** Une clé maître et sa version (stockée dans `key_version`). */
export interface VersionedKey {
  readonly version: number;
  readonly key: Buffer;
}

export interface KeyRingSettings {
  readonly current: VersionedKey;
  readonly previous: readonly VersionedKey[];
}

/** Configuration incohérente du porte-clés ; le message ne cite jamais une clé. */
export class KeyRingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyRingConfigError";
  }
}

function assertVersions(settings: KeyRingSettings): void {
  const { current, previous } = settings;
  const seen = new Set<number>();
  for (const { version } of [current, ...previous]) {
    if (!Number.isInteger(version) || version < 1) {
      throw new KeyRingConfigError("Version de clé invalide : entier >= 1 attendu");
    }
    if (seen.has(version))
      throw new KeyRingConfigError("Version de clé dupliquée dans le porte-clés");
    seen.add(version);
  }
  if (previous.some((entry) => entry.version > current.version)) {
    throw new KeyRingConfigError("La version courante doit dépasser toute version précédente");
  }
}

/**
 * Porte-clés versionné : chiffre toujours avec la clé courante, déchiffre avec la clé de la version
 * portée par le chiffré. Version inconnue : `TokenDecryptionError`, jamais de repli sur une autre
 * clé. Aucune erreur ne cite une clé.
 */
export function createKeyRing(settings: KeyRingSettings): TokenCipher {
  assertVersions(settings);
  const { current, previous } = settings;
  const ciphers = new Map<number, TokenCipher>();
  for (const { version, key } of [current, ...previous]) {
    ciphers.set(version, createTokenCipher(key, { keyVersion: version }));
  }
  const currentCipher = ciphers.get(current.version) as TokenCipher;
  return {
    keyVersion: current.version,
    encrypt: (plaintext, aad) => currentCipher.encrypt(plaintext, aad),
    decrypt(secret, aad) {
      const cipher = ciphers.get(secret.keyVersion);
      if (cipher === undefined) throw new TokenDecryptionError();
      return cipher.decrypt(secret, aad);
    },
  };
}

/**
 * Porte-clés de la configuration, ou `null` sans clé de chiffrement. Une configuration bâtie à la
 * main (tests) peut ne porter que `encryptionKey` : version 1, sans clé précédente.
 */
export function keyRingOf(config: {
  readonly encryptionKey?: Buffer;
  readonly encryptionKeyring?: KeyRingSettings;
}): TokenCipher | null {
  const { encryptionKey, encryptionKeyring } = config;
  if (encryptionKeyring !== undefined) return createKeyRing(encryptionKeyring);
  if (encryptionKey === undefined) return null;
  return createKeyRing({ current: { version: 1, key: encryptionKey }, previous: [] });
}
