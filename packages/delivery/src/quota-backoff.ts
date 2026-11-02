import type { BackoffPolicy, QuotaOptions } from "./quota-policy.ts";
import type { QuotaSignal } from "./quota-signal.ts";
import type { QuotaState } from "./quota-state.ts";
import type { RunEvent } from "./run-event.ts";

/** Recul global (incident 26). `jitter` dans [0,1) est un PARAMÈTRE : le domaine ne tire aucun aléa. */
export const onQuotaHit = (
  _state: QuotaState,
  _signal: QuotaSignal,
  _now: number,
  _jitter: number,
  _policy: BackoffPolicy,
  _options?: QuotaOptions,
): QuotaState => {
  throw new Error("TK-74b : onQuotaHit non implémenté");
};

/** Point d'entrée unique côté Run : événement NEUTRE `quota_hit`, jamais un `block`. */
export const quotaHitEvent = (_signal: QuotaSignal): RunEvent => {
  throw new Error("TK-74b : quotaHitEvent non implémenté");
};

/** Garde runner (D2) : un `block` de cause `quota` est refusé (InvalidQuotaError). */
export const assertNoQuotaBlock = (_event: RunEvent): void => {
  throw new Error("TK-74b : assertNoQuotaBlock non implémenté");
};
