import type { QuotaOptions, Usage, UsagePolicy } from "./quota-policy.ts";
import type { QuotaState } from "./quota-state.ts";

/** Consommation par fenêtre fixe ; dédoublonne par `usage.id` ; un usage réussi après `resumeAt` remet l'exponentielle à 0. */
export const recordUsage = (
  _state: QuotaState,
  _usage: Usage,
  _now: number,
  _policy: UsagePolicy,
  _options?: QuotaOptions,
): QuotaState => {
  throw new Error("TK-74b : recordUsage non implémenté");
};
