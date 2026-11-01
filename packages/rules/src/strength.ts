import type { Rule } from "./catalog-types.ts";

export type Strength = Pick<Rule, "severity" | "enforcement">;

const SEVERITY_RANK = { advisory: 0, blocking: 1 } as const;
const ENFORCEMENT_RANK = { instruction: 0, evidence: 1, gate: 2 } as const;

/** `true` si `to` est strictement plus faible que `from` (D7 : gate > evidence > instruction ;
 *  blocking > advisory). Plus faible sur un seul axe suffit ; deux gates restent de même force. */
export const isWeaker = (from: Strength, to: Strength): boolean =>
  SEVERITY_RANK[to.severity] < SEVERITY_RANK[from.severity] ||
  ENFORCEMENT_RANK[to.enforcement.kind] < ENFORCEMENT_RANK[from.enforcement.kind];
