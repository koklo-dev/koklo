import { assertNow, fail, QUOTA_MAX_BACKOFF_MS } from "./quota-check.ts";
import { freezeQuotaState, type QuotaState } from "./quota-state.ts";
import { checkQuotaState } from "./quota-state-check.ts";

export { QUOTA_MAX_BACKOFF_MS, QUOTA_MAX_EPOCH_MS, QUOTA_MIN_EPOCH_MS } from "./quota-check.ts";
export const QUOTA_MAX_SERIALIZED_CHARS = 1_000_000;

/** JSON stable (clés triées) ; un état forgé est refusé aussi à l'écriture. */
export const serializeQuotaState = (state: QuotaState): string => {
  const text = JSON.stringify(checkQuotaState(state));
  return text.length > QUOTA_MAX_SERIALIZED_CHARS ? fail("état trop volumineux") : text;
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return fail("JSON invalide");
  }
};

/**
 * JSON strict : état forgé refusé (InvalidQuotaError), résultat gelé en profondeur. Avec `now`
 * (recommandé au chargement), un `resumeAt` au-delà de `now + 24 h` est ÉCRÊTÉ à ce plafond dur ;
 * sans `now`, seule la borne de plausibilité (2100) s'applique.
 */
export const parseQuotaState = (text: string, now?: number): QuotaState => {
  if (typeof text !== "string") return fail("état sérialisé non textuel");
  if (text.length > QUOTA_MAX_SERIALIZED_CHARS) return fail("état sérialisé trop volumineux");
  if (now !== undefined) assertNow(now);
  const state = checkQuotaState(parseJson(text));
  const ceiling = now === undefined ? null : now + QUOTA_MAX_BACKOFF_MS;
  return freezeQuotaState(
    ceiling !== null && state.resumeAt !== null && state.resumeAt > ceiling
      ? { ...state, resumeAt: ceiling }
      : state,
  );
};
