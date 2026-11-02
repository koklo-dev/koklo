/** Nettoyage de la sortie d'agent avant détection : ni séquence ANSI, ni contrôle, ni bidi. */
const ESC = 27;
const TAB = 9;
const NEWLINE = 10;

const inRange = (code: number, low: number, high: number): boolean => code >= low && code <= high;

const isForbiddenCode = (code: number): boolean =>
  (code < 32 && code !== TAB && code !== NEWLINE) ||
  inRange(code, 127, 159) ||
  inRange(code, 0x200b, 0x200f) ||
  inRange(code, 0x202a, 0x202e) ||
  inRange(code, 0x2066, 0x2069) ||
  code === 0xfeff;

/** Index suivant une séquence CSI (`ESC [ params final`) ; un ESC isolé est simplement sauté. */
const skipEscape = (text: string, afterEsc: number): number => {
  if (text[afterEsc] !== "[") return afterEsc;
  let index = afterEsc + 1;
  while (inRange(text.charCodeAt(index), 0x20, 0x3f)) index += 1;
  return inRange(text.charCodeAt(index), 0x40, 0x7e) ? index + 1 : index;
};

export const cleanText = (text: string): string => {
  const kept: string[] = [];
  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === ESC) {
      index = skipEscape(text, index + 1);
      continue;
    }
    if (!isForbiddenCode(code)) kept.push(text[index] as string);
    index += 1;
  }
  return kept.join("").replace(/[ \t ]+/g, " ");
};

/** Ligne de diff (`+`, `-`, `@@`) ou nom de test : une citation, jamais une sortie du fournisseur. */
const QUOTED_LINE = /^(?:[+-]|@@|\s*(?:it|test|describe)(?:\.\w+)*\()/;

/** Les derniers `maxChars` caractères, nettoyés, sans les lignes citées. */
export const scanText = (output: string, maxChars: number): string =>
  cleanText(output.slice(-maxChars))
    .split("\n")
    .filter((line) => !QUOTED_LINE.test(line))
    .join("\n");
