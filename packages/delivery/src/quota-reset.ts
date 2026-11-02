import type { QuotaSignal } from "./quota-signal.ts";

/** Instant de reprise (epoch ms) d'un signal, ou null (repli exponentiel) ; arithmétique entière, sans Date ni Intl. */
export const resolveResetAt = (
  _signal: QuotaSignal,
  _now: number,
  _utcOffsetMinutes: number | null,
): number | null => {
  throw new Error("TK-74a : resolveResetAt non implémenté");
};
