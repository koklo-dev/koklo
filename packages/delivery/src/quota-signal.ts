import { InvalidQuotaError } from "./errors.ts";
import { isEpoch, QUOTA_MAX_BACKOFF_MS } from "./quota-check.ts";
import { type ScannedLine, scanLines } from "./quota-text.ts";

/** Détection d'un quota fournisseur dans la sortie d'une session d'agent. */
export const QUOTA_KINDS = ["rate_window", "exhausted", "unknown_limit"] as const;
export type QuotaKind = (typeof QUOTA_KINDS)[number];

/**
 * Force du signal. FORT : date du fournisseur (epoch, `retry-after`, « resets <heure> »), phrase
 * ancrée en début de ligne ou après `API Error: `. FAIBLE : motif nu, heuristique, filet de sécurité,
 * ligne colorée. Un signal faible provoque un recul simple, sans compter vers `exhausted`.
 */
export const QUOTA_STRENGTHS = ["strong", "weak"] as const;
export type QuotaStrength = (typeof QUOTA_STRENGTHS)[number];

/** « resets 3pm » : heure murale, sans fuseau résolu (nom éventuel conservé tel quel, jamais interprété). */
export interface ClockHint {
  readonly hour: number;
  readonly minute: number;
  readonly zone: string | null;
}

export interface QuotaSignal {
  readonly kind: QuotaKind;
  readonly strength: QuotaStrength;
  /** Instant absolu de reprise (epoch ms) quand le fournisseur le donne (`|<epoch s>`). */
  readonly resetAt: number | null;
  /** Délai de reprise (`retry-after`) en ms. */
  readonly retryAfterMs: number | null;
  readonly resetHint: ClockHint | null;
  /** Nom du motif de la table qui a reconnu la sortie. */
  readonly pattern: string;
  /** Extrait de sortie borné et assaini (ni contrôle ni bidi). */
  readonly raw: string;
  /** Identifiant fourni par l'appelant (idempotence), absent à la détection. */
  readonly id?: string;
}

export interface QuotaPattern {
  readonly name: string;
  readonly kind: QuotaKind;
  readonly strength: QuotaStrength;
  readonly regex: RegExp;
}

export type AgentFailure =
  | { readonly kind: "quota"; readonly signal: QuotaSignal }
  | { readonly kind: "other" };

/** Seuls les derniers caractères sont examinés (une citation en milieu de réponse n'est pas un quota). */
export const QUOTA_SCAN_CHARS = 4000;
export const QUOTA_RAW_MAX_CHARS = 500;

/*
 * Motifs : AUCUN quantificateur imbriqué, toutes les répétitions sont bornées, donc pas de retour
 * arrière catastrophique ; chaque motif est évalué sur UNE ligne. Groupes nommés lus par
 * `buildSignal` : epoch, retry, hour, minute, meridiem, zone. Formulations = HYPOTHÈSES sans capture
 * réelle (UNVERIFIED, voir docs/quality-and-operations.md).
 */
const CLOCK = String.raw`(?<hour>\d{1,2})(?::(?<minute>\d{2}))? ?(?<meridiem>[ap]m)\b`;
const ZONE = String.raw`(?: ?\((?<zone>[A-Za-z][\w+-]{0,30}(?:/[A-Za-z][\w+-]{0,30}){0,3})\))?`;
const RESETS = String.raw`(?:[^\n]{0,20}?resets ${CLOCK}${ZONE})?`;
const MONTH_OR_DAY =
  "(?:mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)";
/** Ancre : début de ligne (puce admise), `API Error: `, `Error: `, ou valeur JSON `"result":"`. */
const ANCHOR = String.raw`(?:^[ \t]{0,20}(?:[-•∙·][ \t]{1,3})?|\bAPI Error: (?:\d{3} )?|\bError: |"(?:result|message|error)": ?")`;

const pattern = (
  name: string,
  kind: QuotaKind,
  strength: QuotaStrength,
  source: string,
): QuotaPattern => Object.freeze({ name, kind, strength, regex: new RegExp(source, "i") });

/** Signaux FAIBLES : motifs nus, heuristique et filet de sécurité (UNVERIFIED) ; recul simple. */
const WEAK_PATTERNS: readonly QuotaPattern[] = [
  pattern("rate-limit-error-bare", "rate_window", "weak", String.raw`\brate_limit_error\b`),
  pattern(
    "http-429-rate-limit-net",
    "unknown_limit",
    "weak",
    String.raw`\b429\b[^\n]{0,40}?(?:rate limit|too many requests)|(?:rate limit|too many requests)[^\n]{0,40}?\b429\b`,
  ),
  pattern("request-rejected-429", "unknown_limit", "weak", String.raw`\brequest rejected \(429\)`),
  pattern(
    "usage-limit-reached-net",
    "unknown_limit",
    "weak",
    String.raw`\b(?:usage|rate) limit (?:reached|exceeded)\b`,
  ),
  pattern(
    "exceeded-your-usage-limit",
    "unknown_limit",
    "weak",
    String.raw`\bexceeded your usage limit\b`,
  ),
  pattern("out-of-usage-net", "unknown_limit", "weak", String.raw`\bout of (?:extra )?usage\b`),
  pattern(
    "unknown-limit-heuristic",
    "unknown_limit",
    "weak",
    String.raw`\b(?:limit|quota)\b[^\n]{0,60}?\bresets (?:at|in|on|\d|${MONTH_OR_DAY}[a-z]*\b)`,
  ),
];

/** Table de motifs en DONNÉES : une entrée par formulation, un test par entrée ; le premier gagne. */
export const QUOTA_PATTERNS: readonly QuotaPattern[] = Object.freeze([
  pattern(
    "claude-usage-limit-reached-epoch",
    "rate_window",
    "strong",
    String.raw`${ANCHOR}claude (?:ai )?usage limit reached\|(?<epoch>\d{1,20})`,
  ),
  pattern(
    "five-hour-limit-resets-clock",
    "rate_window",
    "strong",
    `${ANCHOR}5[-–—]hour limit reached${RESETS}`,
  ),
  pattern("weekly-limit-reached", "rate_window", "strong", `${ANCHOR}weekly limit reached`),
  pattern("opus-limit-reached", "rate_window", "strong", `${ANCHOR}opus limit reached${RESETS}`),
  pattern(
    "your-limit-will-reset-at",
    "rate_window",
    "strong",
    String.raw`\byour limit will reset at ${CLOCK}${ZONE}`,
  ),
  pattern(
    "hit-your-limit-resets",
    "rate_window",
    "strong",
    `${ANCHOR}you(?:'ve|’ve| have) hit your limit${RESETS}`,
  ),
  pattern(
    "out-of-usage-resets",
    "rate_window",
    "strong",
    String.raw`\bout of (?:extra )?usage[^\n]{0,20}?resets ${CLOCK}${ZONE}`,
  ),
  pattern(
    "api-429-retry-after",
    "rate_window",
    "strong",
    String.raw`(?:\b429\b|rate_limit_error)[^\n]{0,60}?retry-after:? ?(?<retry>\d{1,9})\b`,
  ),
  pattern(
    "api-429-rate-limit-error",
    "rate_window",
    "strong",
    String.raw`(?:"type\\?": ?\\?"|\bAPI Error:[^\n]{0,40}?\b)rate_limit_error\b`,
  ),
  pattern(
    "api-429-too-many-requests",
    "rate_window",
    "strong",
    String.raw`${ANCHOR}(?:http )?429\b[^\n]{0,20}?too many requests`,
  ),
  pattern(
    "credit-balance-too-low",
    "exhausted",
    "strong",
    `${ANCHOR}(?:your )?credit balance is too low`,
  ),
  ...WEAK_PATTERNS,
]);

type Groups = Readonly<Record<string, string | undefined>>;

const epochToMs = (digits: string | undefined): number | null => {
  if (digits === undefined) return null;
  const ms = Number(digits) * 1000;
  return isEpoch(ms) ? ms : null;
};

/** `retry-after` en ms, plafonné à 24 h (une valeur démesurée ne bloque jamais le runner). */
const retryToMs = (digits: string | undefined): number | null =>
  digits === undefined ? null : Math.min(Number(digits) * 1000, QUOTA_MAX_BACKOFF_MS);

/** « 3pm » -> 15 h, « 12am » -> 0 h, « 12pm » -> 12 h ; heure ou minute hors cadran -> pas d'indice. */
const clockHint = (groups: Groups): ClockHint | null => {
  if (groups.hour === undefined || groups.meridiem === undefined) return null;
  const hour = Number(groups.hour);
  const minute = Number(groups.minute ?? "0");
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = groups.meridiem.toLowerCase() === "pm" ? 12 : 0;
  return Object.freeze({ hour: (hour % 12) + pm, minute, zone: groups.zone ?? null });
};

/** Extrait de la ligne reconnue, borné à `QUOTA_RAW_MAX_CHARS`. */
const excerpt = (line: string, index: number): string => {
  const begin = Math.max(0, index - 100);
  return line.slice(begin, begin + QUOTA_RAW_MAX_CHARS).trim();
};

/** Une ligne colorée (terminal) ne prouve rien : le signal reste faible, donc sans escalade. */
const buildSignal = (
  found: QuotaPattern,
  match: RegExpExecArray,
  line: ScannedLine,
): QuotaSignal => {
  const groups: Groups = match.groups ?? {};
  return Object.freeze({
    kind: found.kind,
    strength: line.colored ? "weak" : found.strength,
    resetAt: epochToMs(groups.epoch),
    retryAfterMs: retryToMs(groups.retry),
    resetHint: clockHint(groups),
    pattern: found.name,
    raw: excerpt(line.text, match.index),
  });
};

export const detectQuota = (output: string): QuotaSignal | null => {
  if (typeof output !== "string") throw new InvalidQuotaError("sortie d'agent non textuelle");
  const lines = scanLines(output, QUOTA_SCAN_CHARS);
  for (const candidate of QUOTA_PATTERNS) {
    for (const line of lines) {
      const match = candidate.regex.exec(line.text);
      if (match !== null) return buildSignal(candidate, match, line);
    }
  }
  return null;
};

const OTHER: AgentFailure = Object.freeze({ kind: "other" });

/** Passe AVANT toute autre classification : un quota ne tombe jamais en « spec ambiguë » (incident 22). */
export const classifyAgentFailure = (output: string): AgentFailure => {
  const signal = detectQuota(output);
  return signal === null ? OTHER : Object.freeze({ kind: "quota", signal });
};
