import type {
  BackoffPolicy,
  QuotaScope,
  QuotaSignal,
  QuotaState,
  Usage,
  UsagePolicy,
} from "../src/index.ts";

/** 2027-01-15T08:00:00Z, multiple exact d'une heure : fenêtres alignées sans calcul caché. */
export const NOW = 1_800_000_000_000;
export const MINUTE = 60_000;
export const HOUR = 3_600_000;

/** Valeurs de TEST (D1/D3) : le paquet n'en code aucune, l'appelant les passe en paramètre. */
export const BACKOFF: BackoffPolicy = {
  baseMs: MINUTE,
  maxDelayMs: 12 * HOUR,
  jitterRatio: 0.25,
  maxConsecutiveHits: 5,
  utcOffsetMinutes: 0,
};

export const USAGE: UsagePolicy = {
  windowMs: HOUR,
  maxSeenIds: 3,
  organization: { maxRuns: 10 },
  project: { maxRuns: 2, maxTokens: 1000 },
  agent: { maxRuns: 5 },
};

export const SCOPE: QuotaScope = { organization: "acme", project: "app", agent: "developer" };
export const OTHER_SCOPES: readonly QuotaScope[] = [
  { organization: "acme", project: "other", agent: "reviewer" },
  { organization: "acme", agent: "analyst" },
  { organization: "globex" },
];

export const signal = (overrides: Partial<QuotaSignal> = {}): QuotaSignal => ({
  kind: "rate_window",
  strength: "strong",
  resetAt: null,
  retryAfterMs: null,
  resetHint: null,
  pattern: "test",
  raw: "5-hour limit reached",
  ...overrides,
});

export const usage = (id: string, overrides: Partial<Usage> = {}): Usage => ({
  id,
  scope: SCOPE,
  runs: 1,
  tokens: 100,
  ...overrides,
});

/** Etat littéral (indépendant de l'implémentation). */
export const stateAt = (overrides: Partial<QuotaState> = {}): QuotaState => ({
  status: "ok",
  resumeAt: null,
  consecutiveHits: 0,
  lastHitAt: null,
  lastSignalId: null,
  windows: {},
  usageIds: [],
  version: 0,
  ...overrides,
});

export const lcg = (seed: number) => {
  let state = seed >>> 0;
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % bound;
  };
};
