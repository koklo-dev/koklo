/** Détection d'un quota fournisseur dans la sortie d'une session d'agent (squelette TK-74a, étape RED). */
export const QUOTA_KINDS = ["rate_window", "exhausted", "unknown_limit"] as const;
export type QuotaKind = (typeof QUOTA_KINDS)[number];

/** « resets 3pm » : heure murale, sans fuseau résolu (nom éventuel conservé tel quel, jamais interprété). */
export interface ClockHint {
  readonly hour: number;
  readonly minute: number;
  readonly zone: string | null;
}

export interface QuotaSignal {
  readonly kind: QuotaKind;
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
  readonly regex: RegExp;
}

export type AgentFailure =
  | { readonly kind: "quota"; readonly signal: QuotaSignal }
  | { readonly kind: "other" };

/** Seuls les derniers caractères sont examinés (une citation en milieu de réponse n'est pas un quota). */
export const QUOTA_SCAN_CHARS = 4000;
export const QUOTA_RAW_MAX_CHARS = 500;
/** Table de motifs en DONNÉES : une entrée par formulation, un test par entrée. */
export const QUOTA_PATTERNS: readonly QuotaPattern[] = [];

export const detectQuota = (_output: string): QuotaSignal | null => {
  throw new Error("TK-74a : detectQuota non implémenté");
};

/** Passe AVANT toute autre classification : un quota ne tombe jamais en « spec ambiguë » (incident 22). */
export const classifyAgentFailure = (_output: string): AgentFailure => {
  throw new Error("TK-74a : classifyAgentFailure non implémenté");
};
