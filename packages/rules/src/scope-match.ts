const WILDCARD = "*";
const ANY_DEPTH = "**";

const segmentsOf = (path: string): string[] => path.split("/").filter((s) => s !== "" && s !== ".");

/** Normalise un chemin relatif ; `undefined` si invalide (`..`, absolu, `\`, octet nul). */
export const normalizePath = (path: string): string | undefined => {
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/")) return undefined;
  const segments = segmentsOf(path);
  if (segments.includes("..")) return undefined;
  return segments.length === 0 ? "." : segments.join("/");
};

/** Motif valide : relatif, sans segment `..`, non vide. */
export const isValidPattern = (pattern: string): boolean =>
  pattern !== "" && normalizePath(pattern) !== undefined;

/** Joker `*` dans un seul segment (algorithme à deux pointeurs, sans expression régulière). */
const matchSegment = (pattern: string, text: string): boolean => {
  let p = 0;
  let t = 0;
  let star = -1;
  let resume = 0;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === WILDCARD) {
      star = p++;
      resume = t;
    } else if (p < pattern.length && pattern[p] === text[t]) {
      p++;
      t++;
    } else if (star >= 0) {
      p = star + 1;
      t = ++resume;
    } else {
      return false;
    }
  }
  while (pattern[p] === WILDCARD) p++;
  return p === pattern.length;
};

/** Correspondance segment par segment ; `**` absorbe 0..n segments (programmation dynamique). */
const matchSegments = (pattern: readonly string[], path: readonly string[]): boolean => {
  const memo = new Map<number, boolean>();
  const walk = (i: number, j: number): boolean => {
    if (i === pattern.length) return j === path.length;
    const key = i * (path.length + 1) + j;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const segment = pattern[i] as string;
    const result =
      segment === ANY_DEPTH
        ? walk(i + 1, j) || (j < path.length && walk(i, j + 1))
        : j < path.length && matchSegment(segment, path[j] as string) && walk(i + 1, j + 1);
    memo.set(key, result);
    return result;
  };
  return walk(0, 0);
};

/** Motif minimal (D6) : `*` dans un segment, segment `**` = 0..n segments, reste littéral,
 *  sensible à la casse, dotfiles inclus, ni `?` ni `[]` ; sans joker le motif couvre le chemin
 *  et ses descendants. Motif ou chemin invalide : jamais de correspondance. */
export const matchesPath = (pattern: string, path: string): boolean => {
  const normalizedPattern = pattern === "" ? undefined : normalizePath(pattern);
  const normalizedPath = normalizePath(path);
  if (normalizedPattern === undefined || normalizedPath === undefined) return false;
  const patternSegments = segmentsOf(normalizedPattern);
  const pathSegments = segmentsOf(normalizedPath);
  if (pattern.includes(WILDCARD)) return matchSegments(patternSegments, pathSegments);
  return patternSegments.every((segment, index) => segment === pathSegments[index]);
};

/** `true` si au moins un motif correspond ; indépendant de l'ordre des motifs. */
export const matchesAny = (patterns: readonly string[], path: string): boolean =>
  patterns.some((pattern) => matchesPath(pattern, path));
