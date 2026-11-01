/**
 * Garde d'import des faux (TK-54a, non bloquant 50c n°1) : le code de production n'importe jamais
 * `@koklo/domain/testing` ni `@koklo/llm/testing`. Squelette : implémenté au Green.
 */
export const FORBIDDEN_TESTING_SPECIFIERS: readonly string[] = [
  "@koklo/domain/testing",
  "@koklo/llm/testing",
];

/** Spécificateurs interdits trouvés dans une source (import statique, dynamique, require, export-from). */
export function findForbiddenTestingImports(_source: string): string[] {
  throw new Error("not implemented");
}
