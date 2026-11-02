import { InvalidQuotaError, StaleQuotaError } from "./errors.ts";
import type { QuotaOptions } from "./quota-policy.ts";

/** Bornes de plausibilité d'un instant persisté : 2000-01-01 et 2100-01-01 (epoch ms). */
export const QUOTA_MIN_EPOCH_MS = 946_684_800_000;
export const QUOTA_MAX_EPOCH_MS = 4_102_444_800_000;
/** Plafond DUR de tout recul : 24 h, quelle que soit la politique ou la date du fournisseur. */
export const QUOTA_MAX_BACKOFF_MS = 86_400_000;
/** Un décalage UTC se compte en minutes, strictement entre -24 h et +24 h. */
const MAX_OFFSET_MINUTES = 1440;

/** Refus d'une entrée : le message ne reprend jamais la donnée reçue. */
export const fail: (reason: string) => never = (reason) => {
  throw new InvalidQuotaError(reason);
};

export const isSafeCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

export const isPositiveInt = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

export const isEpoch = (value: unknown): value is number =>
  Number.isSafeInteger(value) &&
  (value as number) >= QUOTA_MIN_EPOCH_MS &&
  (value as number) <= QUOTA_MAX_EPOCH_MS;

export const isUtcOffset = (value: unknown): value is number =>
  Number.isInteger(value) && Math.abs(value as number) < MAX_OFFSET_MINUTES;

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const assertNow = (now: unknown): void => {
  if (!isSafeCount(now)) fail("instant invalide (entier >= 0 attendu)");
};

/** Valide `options` et renvoie la version attendue éventuelle. */
export const expectedVersionOf = (options: QuotaOptions | undefined): number | undefined => {
  if (options === undefined) return undefined;
  if (!isObject(options)) return fail("options invalides");
  const { expectedVersion } = options;
  if (expectedVersion !== undefined && !isSafeCount(expectedVersion)) {
    return fail("expectedVersion invalide");
  }
  return expectedVersion as number | undefined;
};

/** Concurrence optimiste : l'état est PARTAGÉ, une version périmée est refusée. */
export const assertFresh = (actualVersion: number, expectedVersion: number | undefined): void => {
  if (expectedVersion !== undefined && expectedVersion !== actualVersion) {
    throw new StaleQuotaError(expectedVersion, actualVersion);
  }
};
