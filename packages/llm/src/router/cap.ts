import type { AiMonthConsumption } from "@koklo/domain";

export type AiCapState = "ok" | "warning" | "suspended";

/** Seuil d'alerte : 80 % du plafond (4/5, en entiers pour éviter les flottants). */
const WARN_NUM = 4;
const WARN_DEN = 5;

/** `cap` absent = pas de plafond (A1) ; au plafond exactement, les appels sont suspendus. */
export const capStateOf = (
  consumption: AiMonthConsumption,
  cap: number | undefined,
): AiCapState => {
  if (cap === undefined) {
    return "ok";
  }
  if (consumption.costMicroUsd >= cap) {
    return "suspended";
  }
  return consumption.costMicroUsd * WARN_DEN >= cap * WARN_NUM ? "warning" : "ok";
};
