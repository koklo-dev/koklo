import { compareText } from "./compare.ts";
import { kokloStrictProfile } from "./koklo-strict.ts";

export interface BiomeDrift {
  /** Règle `strict.*` concernée. */
  readonly ruleId: string;
  /** Réglage Biome comparé (`maxLines`, `maxAllowedComplexity`, `noExplicitAny`). */
  readonly setting: "maxLines" | "maxAllowedComplexity" | "noExplicitAny";
  readonly expected: number | string;
  /** Absent si le réglage manque dans la configuration. */
  readonly actual?: number | string;
}

type Setting = BiomeDrift["setting"];

interface Limit {
  readonly ruleId: string;
  readonly setting: Setting;
  /** Groupe puis nom de la règle Biome, puis chemin de l'option dans sa configuration. */
  readonly group: string;
  readonly rule: string;
  readonly option: string | undefined;
  readonly param: "max" | "level";
}

const LIMITS: readonly Limit[] = [
  {
    ruleId: "strict.fn-lines",
    setting: "maxLines",
    group: "complexity",
    rule: "noExcessiveLinesPerFunction",
    option: "maxLines",
    param: "max",
  },
  {
    ruleId: "strict.cognitive-complexity",
    setting: "maxAllowedComplexity",
    group: "complexity",
    rule: "noExcessiveCognitiveComplexity",
    option: "maxAllowedComplexity",
    param: "max",
  },
  {
    ruleId: "strict.no-explicit-any",
    setting: "noExplicitAny",
    group: "suspicious",
    rule: "noExplicitAny",
    option: undefined,
    param: "level",
  },
];

const child = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;

const scalar = (value: unknown): number | string | undefined =>
  typeof value === "number" || typeof value === "string" ? value : undefined;

/** Valeur lue : `options.<option>` pour une limite, sinon le niveau (texte ou `{ level }`). */
const actualOf = (config: unknown, limit: Limit): number | string | undefined => {
  const entry = child(child(child(child(config, "linter"), "rules"), limit.group), limit.rule);
  return limit.option === undefined
    ? scalar(child(entry, "level") ?? entry)
    : scalar(child(child(entry, "options"), limit.option));
};

const expectedOf = (limit: Limit): number | string => {
  const rule = kokloStrictProfile.rules.find((candidate) => candidate.id === limit.ruleId);
  return scalar(rule?.enforcement.params?.[limit.param]) ?? "";
};

const driftOf = (config: unknown, limit: Limit): BiomeDrift | undefined => {
  const expected = expectedOf(limit);
  const actual = actualOf(config, limit);
  if (actual === expected) return undefined;
  const base = { ruleId: limit.ruleId, setting: limit.setting, expected };
  return actual === undefined ? base : { ...base, actual };
};

/** Compare les limites du profil (50, 15, "error") à une configuration Biome déjà lue (`unknown`,
 *  jamais de fichier ici). Tableau vide = aucune dérive ; ne lève jamais, n'altère pas l'entrée. */
export const checkBiomeLimits = (biomeConfig: unknown): readonly BiomeDrift[] =>
  LIMITS.map((limit) => driftOf(biomeConfig, limit))
    .filter((drift): drift is BiomeDrift => drift !== undefined)
    .sort((a, b) => compareText(a.ruleId, b.ruleId));
