import type { QuotaState } from "./quota-state.ts";

/** Bornes de plausibilité d'un instant persisté : 2000-01-01 et 2100-01-01 (epoch ms). */
export const QUOTA_MIN_EPOCH_MS = 946_684_800_000;
export const QUOTA_MAX_EPOCH_MS = 4_102_444_800_000;
export const QUOTA_MAX_SERIALIZED_CHARS = 1_000_000;

/** JSON stable (clés triées). */
export const serializeQuotaState = (_state: QuotaState): string => {
  throw new Error("TK-74b : serializeQuotaState non implémenté");
};

/** JSON strict : état forgé refusé (InvalidQuotaError), résultat gelé en profondeur. */
export const parseQuotaState = (_text: string): QuotaState => {
  throw new Error("TK-74b : parseQuotaState non implémenté");
};
