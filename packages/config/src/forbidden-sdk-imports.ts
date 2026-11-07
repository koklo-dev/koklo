/**
 * Garde des SDK d'IA (TK-95, ADR 0015) : le Vercel AI SDK, ses adaptateurs et le SDK Anthropic ne
 * vivent que dans `packages/llm`. Ce module détecte leurs imports et leurs déclarations.
 */
const SDK_NAME = /^(?:ai|@ai-sdk\/[^/]+|@openrouter\/[^/]+|@anthropic-ai\/[^/]+)$/;
const SDK_SPECIFIER = /^(?:ai|@ai-sdk\/[^/]+|@openrouter\/[^/]+|@anthropic-ai\/[^/]+)(?:\/.*)?$/;

const STRING_OR_COMMENT = /(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

const withoutComments = (source: string): string =>
  source.replace(STRING_OR_COMMENT, (token) =>
    token.startsWith("/") ? token.replace(/[^\n]/g, " ") : token,
  );

const IMPORT_FORMS: readonly RegExp[] = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1/g,
  /\bimport\s*(['"])([^'"]+)\1/g,
  /\b(?:import|require)\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
];

/** Spécificateurs de SDK d'IA trouvés dans une source (import statique, dynamique, require, export-from). */
export function findForbiddenSdkImports(source: string): string[] {
  const code = withoutComments(source);
  return IMPORT_FORMS.flatMap((form) =>
    [...code.matchAll(form)].map((match) => ({ at: match.index, specifier: match[2] as string })),
  )
    .filter(({ specifier }) => SDK_SPECIFIER.test(specifier))
    .sort((a, b) => a.at - b.at)
    .map(({ specifier }) => specifier);
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** Noms de SDK d'IA déclarés dans un `package.json`, tous champs de dépendances confondus. */
export function findForbiddenSdkDependencies(
  manifest: Partial<Record<(typeof DEPENDENCY_FIELDS)[number], Record<string, string>>>,
): string[] {
  return DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})).filter((name) =>
    SDK_NAME.test(name),
  );
}
