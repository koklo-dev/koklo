import { escapePointerSegment } from "./pointer.ts";

/**
 * Détecteur de valeurs de secret (TK-115, B724) : la spec ne contient jamais de secret, seulement le nom d'une variable et
 * son usage. Partagé par l'API et le worker. Pur ; il rend des pointeurs, jamais la valeur trouvée.
 */
export const SECRET_VALUE_CODE = "SECRET_VALUE";
export const SECRET_REFUSAL_MESSAGE =
  "Une valeur de secret ne peut pas entrer dans la spec : gardez seulement le nom de la variable.";

/** Une valeur remplacée (`${VAR}`, `<…>`, `***`) n'est pas un secret. */
const NOT_A_PLACEHOLDER = "(?!\\$\\{|<|\\*{3})";
/** Valeur affectée par `=` : six caractères au moins, hors valeur remplacée. */
const ASSIGNED = `\\s*=\\s*["']?${NOT_A_PLACEHOLDER}[^\\s"',;]{6}`;
/** Les répétitions suivies d'un autre motif sont bornées : un texte hostile se lit en temps linéaire. */
const NAME_PART = "[A-Z0-9_]{0,80}";
const SECRET_NAME = "(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_KEY|DSN)";
const URL_SCHEME = "[a-z][a-z0-9+.-]{0,30}";
const URL_PART = "[^\\s/:@]{0,256}";
const URL_PASSWORD = "[^\\s/@]{1,512}";

/** Clés reconnaissables à leur préfixe, avec une longueur minimale ; jamais au milieu d'un mot (`task-…`). */
const PREFIXED_KEYS: readonly string[] = [
  "sk-[A-Za-z0-9_-]{16,}",
  "(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}",
  "gh[pousr]_[A-Za-z0-9]{20,}",
  "github_pat_[A-Za-z0-9_]{22,}",
  "glpat-[A-Za-z0-9_-]{16,}",
  "xox[baprs]-[A-Za-z0-9-]{10,}",
  "(?:AKIA|ASIA)[0-9A-Z]{16}",
  "AIza[0-9A-Za-z_-]{30,}",
  "SG\\.[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{16,}",
  "whsec_[A-Za-z0-9]{16,}",
  "xkeysib-[A-Za-z0-9-]{20,}",
  "eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}",
];

const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/,
  new RegExp(`(?<![A-Za-z0-9_-])(?:${PREFIXED_KEYS.join("|")})`),
  /\bbearer\s+[A-Za-z0-9._~+/-]{20}/i,
  new RegExp(`\\b${URL_SCHEME}://${URL_PART}:${NOT_A_PLACEHOLDER}${URL_PASSWORD}@`, "i"),
  new RegExp(`\\b${NAME_PART}${SECRET_NAME}${NAME_PART}${ASSIGNED}`),
  new RegExp(`\\b(?:mot de passe|password|secret|token)${ASSIGNED}`, "i"),
];

const holdsSecret = (text: string): boolean =>
  SECRET_PATTERNS.some((pattern) => pattern.test(text));

function collect(value: unknown, pointer: string, found: Set<string>): void {
  if (typeof value === "string") {
    if (holdsSecret(value)) found.add(pointer);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    // Une clé fautive désigne son objet : le pointeur ne la recopie pas.
    if (holdsSecret(key)) found.add(pointer);
    else collect(child, `${pointer}/${escapePointerSegment(key)}`, found);
  }
}

/** Pointeurs JSON des textes (valeurs et clés, à toute profondeur) qui portent une valeur de secret. */
export function findSecretPaths(value: unknown): string[] {
  const found = new Set<string>();
  collect(value, "", found);
  return [...found];
}
