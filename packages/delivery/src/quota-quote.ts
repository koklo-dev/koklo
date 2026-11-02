/**
 * Filtre de citations : une ligne qui cite une phrase de quota (diff, test, commentaire, code,
 * citation Markdown) n'est jamais une sortie du fournisseur. Pur, sans état, sans retour arrière
 * catastrophique (tous les motifs sont ancrés ou bornés).
 */
const FENCE = /^[ \t]{0,3}```/;
const DIFF_HEADER = /^(?:@@ |diff --git |--- \S|\+\+\+ \S)/m;
/** Puce de message (`- Weekly limit reached`) : un tiret, UN espace, puis du texte. */
const BULLET = /^-[ \t]\S/;
const COMMENT = /^[ \t]*(?:\/\/|\/\*|\*|#)/;
const MARKDOWN_QUOTE = /^[ \t]*>/;
const TEST_NAME = /^[ \t]*(?:it|test|describe)(?:\.\w+)*\(/;
const ASSERTION = /\b(?:expect|assert(?:\.\w+)?)\(|\.(?:toBe|toEqual|toContain|toMatch|toThrow)\(/;
const ASSIGNED_STRING =
  /^[ \t]*(?:(?:const|let|var|export|readonly)[ \t]+)*[\w.$[\]]+[ \t]*[:=][ \t]*["'`]/;
/** Ligne réduite à UNE chaîne entre guillemets (une paire clé/valeur JSON n'en est pas une). */
const QUOTED_STRING = /^[ \t]*(["'`])[^"'`]*\1[,;)]*[ \t]*$/;

/** Indices des lignes situées entre deux clôtures ``` appariées (une clôture orpheline est ignorée). */
const fencedLines = (lines: readonly string[]): ReadonlySet<number> => {
  const fences = lines.flatMap((line, i) => (FENCE.test(line) ? [i] : []));
  const inside = new Set<number>();
  for (let k = 0; k + 1 < fences.length; k += 2) {
    for (let i = fences[k] as number; i <= (fences[k + 1] as number); i += 1) inside.add(i);
  }
  return inside;
};

const isDiffLine = (line: string, hasDiffHeader: boolean): boolean => {
  if (line.startsWith("+") || line.startsWith("@@")) return true;
  return line.startsWith("-") && (hasDiffHeader || !BULLET.test(line));
};

const isCodeLine = (line: string): boolean =>
  MARKDOWN_QUOTE.test(line) ||
  COMMENT.test(line) ||
  TEST_NAME.test(line) ||
  ASSERTION.test(line) ||
  ASSIGNED_STRING.test(line) ||
  QUOTED_STRING.test(line);

/** `true` à l'indice d'une ligne citée ; la puce `- ` d'un message de limite n'est pas une citation. */
export const quotedLines = (lines: readonly string[]): readonly boolean[] => {
  const fenced = fencedLines(lines);
  const hasDiffHeader = lines.some((line) => DIFF_HEADER.test(line));
  return lines.map(
    (line, i) =>
      fenced.has(i) || isDiffLine(line, hasDiffHeader) || isCodeLine(line.replace(/^-[ \t]+/, "")),
  );
};
