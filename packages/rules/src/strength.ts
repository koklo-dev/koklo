import type { Rule } from "./catalog-types.ts";

export type Strength = Pick<Rule, "severity" | "enforcement">;

/** `true` si `to` est strictement plus faible que `from` (D7 : gate > evidence > instruction ;
 *  blocking > advisory). Plus faible sur un seul axe suffit. Squelette Red. */
export const isWeaker = (_from: Strength, _to: Strength): boolean => {
  throw new Error("not implemented: isWeaker (TK-71 lot B green)");
};
