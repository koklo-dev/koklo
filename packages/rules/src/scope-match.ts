/** Normalise un chemin relatif ; `undefined` si invalide (`..`, absolu, `\`, octet nul). Squelette Red. */
export const normalizePath = (_path: string): string | undefined => {
  throw new Error("not implemented: normalizePath (TK-71 lot B green)");
};

/** Motif valide : relatif, sans segment `..`, non vide. Squelette Red. */
export const isValidPattern = (_pattern: string): boolean => {
  throw new Error("not implemented: isValidPattern (TK-71 lot B green)");
};

/** Motif minimal (D6) : `*` dans un segment, segment `**` = 0..n segments, reste littéral,
 *  sensible à la casse, dotfiles inclus ; sans joker le motif couvre le chemin et ses descendants. */
export const matchesPath = (_pattern: string, _path: string): boolean => {
  throw new Error("not implemented: matchesPath (TK-71 lot B green)");
};

/** `true` si au moins un motif correspond ; indépendant de l'ordre des motifs. Squelette Red. */
export const matchesAny = (_patterns: readonly string[], _path: string): boolean => {
  throw new Error("not implemented: matchesAny (TK-71 lot B green)");
};
