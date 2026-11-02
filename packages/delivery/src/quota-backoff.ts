import { assertFresh, assertNow, expectedVersionOf, fail } from "./quota-check.ts";
import type { BackoffPolicy, QuotaOptions } from "./quota-policy.ts";
import { resolveResetAt } from "./quota-reset.ts";
import type { QuotaSignal } from "./quota-signal.ts";
import { assertBackoffPolicy, assertJitter, assertSignal } from "./quota-signal-check.ts";
import { freezeQuotaState, type QuotaState } from "./quota-state.ts";
import type { RunEvent } from "./run-event.ts";

/** Au-delà de 2^52 la puissance n'ajoute rien : `maxDelayMs` plafonne bien avant. */
const MAX_EXPONENT = 52;

/** Délai annoncé par le fournisseur (strictement futur), borné à `maxDelayMs` ; null sinon. */
const providerDelay = (signal: QuotaSignal, now: number, policy: BackoffPolicy): number | null => {
  const at = resolveResetAt(signal, now, policy.utcOffsetMinutes);
  return at !== null && at > now ? Math.min(at - now, policy.maxDelayMs) : null;
};

const fallbackDelay = (hits: number, policy: BackoffPolicy): number =>
  Math.min(policy.maxDelayMs, policy.baseMs * 2 ** Math.min(hits, MAX_EXPONENT));

/** Gigue ajoutée, jamais retirée : le recul ne raccourcit pas. `jitter` est un PARAMÈTRE (pas d'aléa). */
const withJitter = (delay: number, jitter: number, policy: BackoffPolicy): number =>
  Math.floor(delay * (1 + jitter * policy.jitterRatio));

/** Rafale (incident 26) : pas de nouveau palier ; seule une date fournisseur plus tardive prolonge. */
const extendBurst = (
  state: QuotaState,
  resumeAt: number,
  signal: QuotaSignal,
  now: number,
  candidate: number | null,
): QuotaState => {
  if (candidate === null || candidate <= resumeAt) return state;
  return freezeQuotaState({
    ...state,
    resumeAt: candidate,
    lastHitAt: now,
    lastSignalId: signal.id ?? null,
    version: state.version + 1,
  });
};

const nextStep = (
  state: QuotaState,
  signal: QuotaSignal,
  now: number,
  delay: number,
  policy: BackoffPolicy,
): QuotaState => {
  const hits = Math.min(state.consecutiveHits + 1, policy.maxConsecutiveHits);
  const exhausted = signal.kind === "exhausted" || hits >= policy.maxConsecutiveHits;
  return freezeQuotaState({
    ...state,
    status: exhausted ? "exhausted" : "backoff",
    resumeAt: exhausted ? null : Math.max(state.resumeAt ?? 0, now + delay),
    consecutiveHits: hits,
    lastHitAt: now,
    lastSignalId: signal.id ?? null,
    version: state.version + 1,
  });
};

const applyHit = (
  state: QuotaState,
  signal: QuotaSignal,
  now: number,
  jitter: number,
  policy: BackoffPolicy,
): QuotaState => {
  const provider = providerDelay(signal, now, policy);
  if (state.status === "backoff" && state.resumeAt !== null && now < state.resumeAt) {
    const candidate = provider === null ? null : now + withJitter(provider, jitter, policy);
    return extendBurst(state, state.resumeAt, signal, now, candidate);
  }
  const delay = provider ?? fallbackDelay(state.consecutiveHits, policy);
  return nextStep(state, signal, now, withJitter(delay, jitter, policy), policy);
};

/**
 * Recul global (incident 26). Ordre : validation, rejeu (même id = état identique), version
 * périmée, calcul. `exhausted` est collant jusqu'à `clearQuota`.
 */
export const onQuotaHit = (
  state: QuotaState,
  signal: QuotaSignal,
  now: number,
  jitter: number,
  policy: BackoffPolicy,
  options?: QuotaOptions,
): QuotaState => {
  assertSignal(signal);
  assertNow(now);
  assertJitter(jitter);
  assertBackoffPolicy(policy);
  const expected = expectedVersionOf(options);
  if (signal.id !== undefined && signal.id === state.lastSignalId) return state;
  assertFresh(state.version, expected);
  return state.status === "exhausted" ? state : applyHit(state, signal, now, jitter, policy);
};

/** Point d'entrée unique côté Run : événement NEUTRE `quota_hit`, jamais un `block`. */
export const quotaHitEvent = (signal: QuotaSignal): RunEvent => {
  assertSignal(signal);
  return Object.freeze({ type: "quota_hit" });
};

/** Garde runner (D2) : un `block` de cause `quota` est refusé (InvalidQuotaError). */
export const assertNoQuotaBlock = (event: RunEvent): void => {
  if (event.type === "block" && event.cause === "quota") {
    fail("un block de cause quota est refusé : utiliser quotaHitEvent");
  }
};
