import type { TokenCipher } from "./token-cipher.ts";

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

/** Squelette du Red (TK-52a) : le Green l'implémente. */
export function createKeyRing(_settings: KeyRingSettings): TokenCipher {
  throw new Error("not implemented");
}
