/**
 * Garde d'import des faux (TK-54a, non bloquant 50c n°1) : le code de production n'importe jamais
 * `@koklo/domain/testing` ni `@koklo/llm/testing`. Premier filet (test de source) ; le second est la
 * règle Biome `noRestrictedImports` de `biome.json`.
 */
export const FORBIDDEN_TESTING_SPECIFIERS: readonly string[] = [
  "@koklo/domain/testing",
  "@koklo/llm/testing",
];

/** Paquet publié (sous-chemin `testing`, profond ou dans `dist`) ou chemin relatif qui y mène. */
const FORBIDDEN_SPECIFIER =
  /^(?:@koklo\/(?:domain|llm)\/(?:[^/]+\/)*testing(?:\/|$)|\.{1,2}\/(?:[^'"]*\/)?(?:domain|llm)\/(?:[^'"]*\/)?testing(?:\/|$))/;

/** Chaîne (guillemets simples, doubles ou gabarit) ou commentaire, dans l'ordre de lecture. */
const STRING_OR_COMMENT = /(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

/** Remplace les commentaires par des blancs ; les chaînes sont conservées (et leurs `//` aussi). */
const withoutComments = (source: string): string =>
  source.replace(STRING_OR_COMMENT, (token) =>
    token.startsWith("/") ? token.replace(/[^\n]/g, " ") : token,
  );

/** Formes d'import reconnues ; le spécificateur est le dernier groupe de capture. */
const IMPORT_FORMS: readonly RegExp[] = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1/g,
  /\bimport\s*(['"])([^'"]+)\1/g,
  /\b(?:import|require)\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
];

/** Spécificateurs interdits trouvés dans une source (import statique, dynamique, require, export-from). */
export function findForbiddenTestingImports(source: string): string[] {
  const code = withoutComments(source);
  return IMPORT_FORMS.flatMap((form) =>
    [...code.matchAll(form)].map((match) => ({ at: match.index, specifier: match[2] as string })),
  )
    .filter(({ specifier }) => FORBIDDEN_SPECIFIER.test(specifier))
    .sort((a, b) => a.at - b.at)
    .map(({ specifier }) => specifier);
}
