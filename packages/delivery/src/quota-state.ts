import type { QuotaScope, UsagePolicy } from "./quota-policy.ts";

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

export const startQuotaState = (): QuotaState => {
  throw new Error("TK-74b : startQuotaState non implémenté");
};

export const canStart = (
  _state: QuotaState,
  _now: number,
  _scope: QuotaScope,
  _policy?: UsagePolicy,
): boolean => {
  throw new Error("TK-74b : canStart non implémenté");
};

/** `now` si libre ; epoch ms sinon ; null = attente humaine (`exhausted`). */
export const nextAllowedAt = (
  _state: QuotaState,
  _now: number,
  _scope: QuotaScope,
  _policy?: UsagePolicy,
): number | null => {
  throw new Error("TK-74b : nextAllowedAt non implémenté");
};

export const quotaDecision = (
  _state: QuotaState,
  _now: number,
  _scope: QuotaScope,
  _policy?: UsagePolicy,
): QuotaDecision => {
  throw new Error("TK-74b : quotaDecision non implémenté");
};

/** Réarmement humain : retour à `ok`, compteurs de recul remis à zéro. */
export const clearQuota = (
  _state: QuotaState,
  _options?: { expectedVersion?: number },
): QuotaState => {
  throw new Error("TK-74b : clearQuota non implémenté");
};
