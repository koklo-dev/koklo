import type { RuleLayer, Waiver } from "./layer-types.ts";
import type { RulesResult } from "./rules-error.ts";

/** Valide une couche (camelCase, strict) ; ne lève jamais. Squelette Red. */
export const parseLayer = (_input: unknown): RulesResult<RuleLayer> => {
  throw new Error("not implemented: parseLayer (TK-71 lot B green)");
};

/** Valide une liste de dérogations (`expires` obligatoire) ; ne lève jamais. Squelette Red. */
export const parseWaivers = (_input: unknown): RulesResult<readonly Waiver[]> => {
  throw new Error("not implemented: parseWaivers (TK-71 lot B green)");
};
