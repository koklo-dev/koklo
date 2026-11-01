import type { Resolution, ResolveInput } from "./resolve-types.ts";
import type { RulesResult } from "./rules-error.ts";

/** Règles effectives pour un rôle et un chemin ; pure, déterministe, ne lève jamais. Squelette Red. */
export const resolveEffectiveRules = (_input: ResolveInput): RulesResult<Resolution> => {
  throw new Error("not implemented: resolveEffectiveRules (TK-71 lot B green)");
};
