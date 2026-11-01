import {
  createKeyRing,
  KeyRingConfigError,
  type KeyRingSettings,
  type VersionedKey,
} from "./key-ring.ts";
import { InvalidEncryptionKeyError, parseEncryptionKey } from "./token-cipher.ts";

const KEY = "KOKLO_ENCRYPTION_KEY";
const VERSION = "KOKLO_ENCRYPTION_KEY_VERSION";
const PREVIOUS = "KOKLO_ENCRYPTION_KEYS_PREVIOUS";
const VERSION_FORMAT = /^[1-9]\d{0,8}$/;

const invalid = (variable: string, rule: string) =>
  new Error(`Configuration invalide (${variable}: ${rule})`);

function parsePrevious(raw: string): VersionedKey[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .map((item) => {
      const separator = item.indexOf(":");
      const version = item.slice(0, separator);
      if (separator < 0 || !VERSION_FORMAT.test(version)) {
        throw invalid(PREVIOUS, "format `version:clé` attendu, version entière >= 1");
      }
      try {
        return { version: Number(version), key: parseEncryptionKey(item.slice(separator + 1)) };
      } catch (error) {
        if (!(error instanceof InvalidEncryptionKeyError)) throw error;
        throw invalid(PREVIOUS, "clé de 32 octets en base64, ou 32 caractères alphanumériques");
      }
    });
}

/**
 * Porte-clés des variables `KOKLO_ENCRYPTION_KEY[_VERSION]` et `KOKLO_ENCRYPTION_KEYS_PREVIOUS`
 * (vides = absentes). Les messages ne citent que des noms de variables, jamais une valeur.
 */
export function keyRingFromEnv(
  currentKey: Buffer | undefined,
  versionRaw: string | undefined,
  previousRaw: string | undefined,
): KeyRingSettings | undefined {
  if (versionRaw !== undefined && !VERSION_FORMAT.test(versionRaw)) {
    throw invalid(VERSION, "entier >= 1 attendu");
  }
  if (currentKey === undefined) {
    if (versionRaw !== undefined || previousRaw !== undefined) {
      throw invalid(KEY, `requise avec ${VERSION} ou ${PREVIOUS}`);
    }
    return undefined;
  }
  const settings = {
    current: { version: versionRaw === undefined ? 1 : Number(versionRaw), key: currentKey },
    previous: previousRaw === undefined ? [] : parsePrevious(previousRaw),
  };
  try {
    createKeyRing(settings);
  } catch (error) {
    if (!(error instanceof KeyRingConfigError)) throw error;
    throw invalid(PREVIOUS, error.message);
  }
  return settings;
}
