import { quotedLines } from "./quota-quote.ts";

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

/** Tirets insécables/typographiques (U+2010 à U+2012, U+2212) -> `-` ; espaces insécables/fins -> espace. */
const normalizeUnicode = (text: string): string =>
  text
    .replace(/[\u2010-\u2012\u2212]/g, "-")
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, " ");

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
  return normalizeUnicode(kept.join("")).replace(/[ \t]+/g, " ");
};

/** Une ligne nettoyée ; `colored` = elle commençait par une séquence ANSI (sortie de terminal). */
export interface ScannedLine {
  readonly text: string;
  readonly colored: boolean;
}

const startsColored = (line: string): boolean => line.trimStart().startsWith("\u001b[");

/**
 * Les derniers `maxChars` caractères, ligne à ligne, nettoyés, sans les lignes citées. Le filtre de
 * citations s'applique avant ET après le nettoyage ANSI.
 */
export const scanLines = (output: string, maxChars: number): readonly ScannedLine[] => {
  const raw = output.slice(-maxChars).split("\n");
  const cleaned = raw.map(cleanText);
  const quoted = quotedLines(raw);
  const quotedClean = quotedLines(cleaned);
  return cleaned.flatMap((text, i) =>
    quoted[i] || quotedClean[i] ? [] : [{ text, colored: startsColored(raw[i] as string) }],
  );
};
