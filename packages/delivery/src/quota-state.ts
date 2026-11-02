import { assertFresh, assertNow, expectedVersionOf } from "./quota-check.ts";
import type { QuotaScope, UsagePolicy } from "./quota-policy.ts";
import { assertScope, assertUsagePolicy } from "./quota-usage-check.ts";
import { capsFreeAt } from "./quota-window.ts";

export const QUOTA_STATUSES = ["ok", "backoff", "exhausted"] as const;
export type QuotaStatus = (typeof QUOTA_STATUSES)[number];

export interface WindowCount {
  readonly start: number;
  readonly runs: number;
  readonly tokens: number;
}

/** Valeur immuable et sérialisable : UN état par runner, partagé par tous les workers (incident 26). */
export interface QuotaState {
  readonly status: QuotaStatus;
  /** Epoch ms ; null si `ok` ou attente humaine (`exhausted`). */
  readonly resumeAt: number | null;
  readonly consecutiveHits: number;
  readonly lastHitAt: number | null;
  readonly lastSignalId: string | null;
  /** Clés `o:<org>`, `p:<org>/<projet>`, `a:<org>/<agent>`. */
  readonly windows: Readonly<Record<string, WindowCount>>;
  readonly usageIds: readonly string[];
  readonly version: number;
}

export type QuotaDecision =
  | { readonly action: "start" }
  | { readonly action: "wait"; readonly until: number }
  | { readonly action: "halt"; readonly reason: "quota_exhausted" };

/** Copie gelée en profondeur : un état est une valeur, jamais modifiée sur place. */
export const freezeQuotaState = (state: QuotaState): QuotaState => {
  const windows = Object.entries(state.windows).map(([key, count]) => [
    key,
    Object.freeze({ start: count.start, runs: count.runs, tokens: count.tokens }),
  ]);
  return Object.freeze({
    ...state,
    windows: Object.freeze(Object.fromEntries(windows)),
    usageIds: Object.freeze([...state.usageIds]),
  });
};

export const startQuotaState = (): QuotaState =>
  freezeQuotaState({
    status: "ok",
    resumeAt: null,
    consecutiveHits: 0,
    lastHitAt: null,
    lastSignalId: null,
    windows: {},
    usageIds: [],
    version: 0,
  });

/** `now` si libre ; epoch ms sinon ; null = attente humaine (`exhausted`). */
export const nextAllowedAt = (
  state: QuotaState,
  now: number,
  scope: QuotaScope,
  policy?: UsagePolicy,
): number | null => {
  assertNow(now);
  assertScope(scope);
  if (policy !== undefined) assertUsagePolicy(policy);
  if (state.status === "exhausted") return null;
  const backoffUntil =
    state.status === "backoff" && state.resumeAt !== null && now < state.resumeAt
      ? state.resumeAt
      : now;
  const capsUntil = policy === undefined ? now : capsFreeAt(state, now, scope, policy);
  return Math.max(backoffUntil, capsUntil);
};

export const canStart = (
  state: QuotaState,
  now: number,
  scope: QuotaScope,
  policy?: UsagePolicy,
): boolean => nextAllowedAt(state, now, scope, policy) === now;

export const quotaDecision = (
  state: QuotaState,
  now: number,
  scope: QuotaScope,
  policy?: UsagePolicy,
): QuotaDecision => {
  const until = nextAllowedAt(state, now, scope, policy);
  if (until === null) return { action: "halt", reason: "quota_exhausted" };
  return until === now ? { action: "start" } : { action: "wait", until };
};

/** Réarmement humain : retour à `ok`, compteurs de recul remis à zéro ; sans effet si déjà libre. */
export const clearQuota = (
  state: QuotaState,
  options?: { expectedVersion?: number },
): QuotaState => {
  assertFresh(state.version, expectedVersionOf(options));
  if (state.status === "ok" && state.consecutiveHits === 0) return state;
  return freezeQuotaState({
    ...state,
    status: "ok",
    resumeAt: null,
    consecutiveHits: 0,
    version: state.version + 1,
  });
};
