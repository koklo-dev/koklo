/** Mots interdits côté client (analyse TK-55 §4.3) ; comparés en mots entiers, sans casse. */
export const FORBIDDEN_WORDS = new Set([
  "git",
  "github",
  "commit",
  "sha",
  "branch",
  "merge",
  "pull",
  "repo",
  "tag",
  "diff",
  "path",
  "snapshot",
  "tables",
  "endpoints",
  "errorcode",
]);

/** Le texte entier, puis ses mots (camelCase, snake_case, tirets), en minuscules. */
export const wordsOf = (text: string): string[] => [
  text.toLowerCase(),
  ...text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/),
];

export interface OpenApiLike {
  components?: { schemas?: Record<string, unknown> };
}

const isRecord = (node: unknown): node is Record<string, unknown> =>
  node !== null && typeof node === "object" && !Array.isArray(node);

const enumValues = (value: unknown): string[] =>
  [value].flat().filter((entry): entry is string => typeof entry === "string");

const refName = (ref: string) => ref.split("/").pop() ?? "";

/** Noms que ce nœud déclare lui-même (propriétés, énumérations), sans descendre. */
function declaredNames(key: string, value: unknown): string[] {
  if (key === "properties" && isRecord(value)) return Object.keys(value);
  if (key === "enum" || key === "const") return enumValues(value);
  return [];
}

/** Clés de propriétés et valeurs d'énumération atteignables depuis `node` (références résolues). */
export function vocabularyOf(
  node: unknown,
  document: OpenApiLike,
  seen = new Set<string>(),
  found: string[] = [],
): string[] {
  const children = Array.isArray(node)
    ? node.map((item) => ["", item] as const)
    : isRecord(node)
      ? Object.entries(node)
      : [];
  for (const [key, value] of children) {
    found.push(...declaredNames(key, value));
    if (key === "$ref" && typeof value === "string") {
      const name = refName(value);
      if (seen.has(name)) continue;
      seen.add(name);
      vocabularyOf(document.components?.schemas?.[name], document, seen, found);
    } else {
      vocabularyOf(value, document, seen, found);
    }
  }
  return found;
}

export const leaksOf = (names: string[]): string[] =>
  names.filter((name) => wordsOf(name).some((word) => FORBIDDEN_WORDS.has(word)));
