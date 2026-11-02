import { fail, isObject, isUtcOffset, QUOTA_MAX_BACKOFF_MS } from "./quota-check.ts";
import type { ClockHint, QuotaSignal } from "./quota-signal.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const isClockPart = (value: unknown, max: number): boolean =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;

const assertClock = (hint: ClockHint): void => {
  if (!isObject(hint) || !isClockPart(hint.hour, 23) || !isClockPart(hint.minute, 59)) {
    fail("indice horaire invalide");
  }
};

/** Prochaine occurrence STRICTEMENT future de l'heure murale, en arithmétique entière. */
const nextWallClock = (hint: ClockHint, now: number, offsetMinutes: number): number => {
  const local = now + offsetMinutes * MINUTE_MS;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  const candidate = dayStart + (hint.hour * 60 + hint.minute) * MINUTE_MS;
  return (candidate > local ? candidate : candidate + DAY_MS) - offsetMinutes * MINUTE_MS;
};

/** Instant de reprise (epoch ms) d'un signal, ou null (repli exponentiel) ; sans Date ni Intl. */
export const resolveResetAt = (
  signal: QuotaSignal,
  now: number,
  utcOffsetMinutes: number | null,
): number | null => {
  if (!Number.isSafeInteger(now)) return fail("instant invalide");
  if (signal.resetAt !== null) return signal.resetAt;
  if (signal.retryAfterMs !== null)
    return now + Math.min(signal.retryAfterMs, QUOTA_MAX_BACKOFF_MS);
  const hint = signal.resetHint;
  if (hint === null || hint.zone !== null) return null;
  assertClock(hint);
  if (utcOffsetMinutes === null) return null;
  if (!isUtcOffset(utcOffsetMinutes)) return fail("décalage UTC invalide");
  return nextWallClock(hint, now, utcOffsetMinutes);
};
