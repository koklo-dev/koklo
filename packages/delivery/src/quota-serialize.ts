import { fail } from "./quota-check.ts";
import { freezeQuotaState, type QuotaState } from "./quota-state.ts";
import { checkQuotaState } from "./quota-state-check.ts";

export { QUOTA_MAX_EPOCH_MS, QUOTA_MIN_EPOCH_MS } from "./quota-check.ts";
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

/** JSON strict : état forgé refusé (InvalidQuotaError), résultat gelé en profondeur. */
export const parseQuotaState = (text: string): QuotaState => {
  if (typeof text !== "string") return fail("état sérialisé non textuel");
  if (text.length > QUOTA_MAX_SERIALIZED_CHARS) return fail("état sérialisé trop volumineux");
  return freezeQuotaState(checkQuotaState(parseJson(text)));
};
