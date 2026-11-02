import { fail, isObject, isPositiveInt, isSafeCount, isUtcOffset } from "./quota-check.ts";
import type { BackoffPolicy } from "./quota-policy.ts";
import { QUOTA_KINDS, type QuotaSignal } from "./quota-signal.ts";
import { isText } from "./value-check.ts";

const nullableCount = (value: unknown): boolean => value === null || isSafeCount(value);

export const assertJitter = (jitter: unknown): void => {
  if (typeof jitter !== "number" || !Number.isFinite(jitter) || jitter < 0 || jitter >= 1) {
    fail("gigue hors de [0,1)");
  }
};

export const assertBackoffPolicy = (policy: BackoffPolicy): void => {
  if (!isObject(policy)) fail("politique de recul absente");
  const { baseMs, maxDelayMs, jitterRatio, maxConsecutiveHits, utcOffsetMinutes } = policy;
  if (!isPositiveInt(baseMs)) fail("baseMs invalide");
  if (!isSafeCount(maxDelayMs) || maxDelayMs < baseMs) fail("maxDelayMs invalide");
  if (typeof jitterRatio !== "number" || !Number.isFinite(jitterRatio) || jitterRatio < 0) {
    fail("jitterRatio invalide");
  }
  if (!isPositiveInt(maxConsecutiveHits)) fail("maxConsecutiveHits invalide");
  if (utcOffsetMinutes !== null && !isUtcOffset(utcOffsetMinutes)) fail("décalage UTC invalide");
};

export const assertSignal = (signal: QuotaSignal): void => {
  if (!isObject(signal)) fail("signal de quota absent");
  if (!QUOTA_KINDS.includes(signal.kind)) fail("nature de signal inconnue");
  if (!nullableCount(signal.resetAt) || !nullableCount(signal.retryAfterMs)) {
    fail("date ou délai de reprise invalide");
  }
  if (signal.resetHint !== null && !isObject(signal.resetHint)) fail("indice horaire invalide");
  if (typeof signal.raw !== "string" || typeof signal.pattern !== "string") {
    fail("signal incomplet");
  }
  if (signal.id !== undefined && !isText(signal.id)) fail("identifiant de signal invalide");
};
