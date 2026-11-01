export interface BiomeDrift {
  /** Règle `strict.*` concernée. */
  readonly ruleId: string;
  /** Réglage Biome comparé (`maxLines`, `maxAllowedComplexity`, `noExplicitAny`). */
  readonly setting: "maxLines" | "maxAllowedComplexity" | "noExplicitAny";
  readonly expected: number | string;
  /** Absent si le réglage manque dans la configuration. */
  readonly actual?: number | string;
}

/** SQUELETTE (TK-71 lot C, Red) : compare les `params` des gates `biome` du profil à une
 *  configuration Biome (`unknown` : JSON déjà lu, jamais de fichier ici). Tableau vide = aucune dérive. */
export const checkBiomeLimits = (_biomeConfig: unknown): readonly BiomeDrift[] => {
  throw new Error("not implemented: checkBiomeLimits");
};
