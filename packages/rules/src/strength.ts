import type { Rule } from "./catalog-types.ts";

export type Strength = Pick<Rule, "severity" | "enforcement">;

const SEVERITY_RANK = { advisory: 0, blocking: 1 } as const;
const ENFORCEMENT_RANK = { instruction: 0, evidence: 1, gate: 2 } as const;

/** Limite chiffrée `params.max` si c'est un nombre (les autres params n'influent pas sur la force). */
const maxOf = (enforcement: Strength["enforcement"]): number | undefined => {
  const max = enforcement.params?.max;
  return typeof max === "number" ? max : undefined;
};

/** Relever ou retirer une limite `max` affaiblit ; l'abaisser ou l'ajouter durcit. */
const limitRaised = (from: Strength["enforcement"], to: Strength["enforcement"]): boolean => {
  const before = maxOf(from);
  if (before === undefined) return false;
  const after = maxOf(to);
  return after === undefined || after > before;
};

/** `true` si `to` est strictement plus faible que `from` (D7 : gate > evidence > instruction ;
 *  blocking > advisory ; à adapter identique, une limite `max` relevée ou retirée). Plus faible
 *  sur un seul axe suffit ; deux gates restent de même force. */
export const isWeaker = (from: Strength, to: Strength): boolean =>
  SEVERITY_RANK[to.severity] < SEVERITY_RANK[from.severity] ||
  ENFORCEMENT_RANK[to.enforcement.kind] < ENFORCEMENT_RANK[from.enforcement.kind] ||
  (to.enforcement.kind === from.enforcement.kind && limitRaised(from.enforcement, to.enforcement));
