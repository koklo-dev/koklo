/**
 * Textes de la Sécurité (TK-117) : une ligne par champ, aucun caractère de contrôle, et jamais de trace technique dans ce
 * que lit le client. Fonctions pures, sans dépendance : les entités et les règles les partagent.
 */

/** Caractères de contrôle et séparateurs de ligne ; la tabulation et le saut de ligne sont jugés à part. */
export const CONTROL_CHARACTERS = /[^\P{Cc}\t\n]|[\u2028\u2029]/u;

const BREAKS = /[\s\p{Cc}]+/gu;

/** Texte ramené sur une ligne, borné : ce qui s'écrit dans un fichier généré ne peut ouvrir aucune autre ligne. */
export function oneLineOf(text: string, max: number): string {
  const line = text.replace(BREAKS, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

/** Début d'un mot : un identifiant n'est jamais cherché au milieu d'un autre mot. */
const WORD_START = "(?<![\\p{L}\\p{N}])";
const IDENTIFIERS = [
  "(?:F|R|ADR|AC)-\\d+",
  "SEC-[A-Za-z]?\\d+",
  "(?:NFR|ST|ENV|C|T|S|P|RL|PM|FX)-[a-z0-9]",
];
const SPEC_DIRS =
  "(?:security|api|data|tech|domain|features|architecture|quality|nfr|design|tests)";
const TRACES: readonly RegExp[] = [
  new RegExp(`${WORD_START}(?:${IDENTIFIERS.join("|")})`, "u"),
  /** Chemin ou nom de fichier du dépôt de spec. */
  new RegExp(`${WORD_START}${SPEC_DIRS}/[\\w.-]+`, "u"),
  /\.(?:ya?ml|json|md|feature)\b/i,
  /** Empreinte de commit : 7 à 40 chiffres hexadécimaux mêlant lettres et chiffres. */
  new RegExp(`${WORD_START}(?=[a-f]*\\d)(?=\\d*[a-f])[0-9a-f]{7,40}(?![\\p{L}\\p{N}])`, "u"),
];
const DASHES = /[\u2010-\u2015\u2212]/g;
const INVISIBLE = /[\u00ad\u200b-\u200f\u2060-\u2064\ufeff]/g;

/** Vrai si le texte porte un identifiant, un chemin ou un SHA ; les variantes de tirets et les invisibles sont repliés. */
export function technicalTraceIn(text: string): boolean {
  const folded = text.normalize("NFKC").replace(INVISIBLE, "").replace(DASHES, "-");
  return TRACES.some((trace) => trace.test(folded));
}

/** Corps d'une carte du résumé client : sans trace technique, bordé, et aucune ligne ne peut ouvrir un titre. */
export const isSummaryText = (text: string): boolean =>
  text === text.trim() && !/^\s*#/m.test(text) && !technicalTraceIn(text);
