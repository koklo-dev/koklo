import { assertFresh, assertNow, expectedVersionOf, fail } from "./quota-check.ts";
import type { QuotaOptions, Usage, UsagePolicy } from "./quota-policy.ts";
import { freezeQuotaState, type QuotaState, type WindowCount } from "./quota-state.ts";
import { assertUsage, assertUsagePolicy } from "./quota-usage-check.ts";
import { currentCount, scopeLevels, windowStart } from "./quota-window.ts";

const sum = (left: number, right: number): number => {
  const total = left + right;
  return Number.isSafeInteger(total) ? total : fail("compteur de consommation dépassé");
};

/** Fenêtres courantes (ou futures) conservées, les échues purgées, niveaux du scope incrémentés. */
const addToWindows = (
  state: QuotaState,
  usage: Usage,
  start: number,
): Readonly<Record<string, WindowCount>> => {
  const kept = Object.entries(state.windows).filter(([, count]) => count.start >= start);
  const next: Record<string, WindowCount> = Object.fromEntries(kept);
  for (const { key } of scopeLevels(usage.scope)) {
    const count = currentCount(state, key, start);
    next[key] = {
      start,
      runs: sum(count.runs, usage.runs),
      tokens: sum(count.tokens, usage.tokens),
    };
  }
  return next;
};

/** Un usage réussi après `resumeAt` remet l'exponentielle à zéro. */
const recovered = (state: QuotaState, now: number): boolean =>
  state.status === "backoff" && state.resumeAt !== null && now >= state.resumeAt;

/** Consommation par fenêtre fixe ; dédoublonne par `usage.id` (liste bornée, id déjà vu = état identique). */
export const recordUsage = (
  state: QuotaState,
  usage: Usage,
  now: number,
  policy: UsagePolicy,
  options?: QuotaOptions,
): QuotaState => {
  assertNow(now);
  assertUsage(usage);
  assertUsagePolicy(policy);
  const expected = expectedVersionOf(options);
  if (state.usageIds.includes(usage.id)) return state;
  assertFresh(state.version, expected);
  const reset = recovered(state, now)
    ? { status: "ok" as const, resumeAt: null, consecutiveHits: 0 }
    : {};
  return freezeQuotaState({
    ...state,
    ...reset,
    windows: addToWindows(state, usage, windowStart(now, policy.windowMs)),
    usageIds: [...state.usageIds, usage.id].slice(-policy.maxSeenIds),
    version: state.version + 1,
  });
};
