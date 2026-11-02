/** Paramètres du quota : AUCUNE valeur codée dans le paquet, tout vient de l'appelant (D1). */
export interface BackoffPolicy {
  readonly baseMs: number;
  readonly maxDelayMs: number;
  /** Gigue maximale, en proportion du délai (>= 0). */
  readonly jitterRatio: number;
  readonly maxConsecutiveHits: number;
  /** Décalage UTC (minutes) pour résoudre « resets 3pm » ; null = repli exponentiel. */
  readonly utcOffsetMinutes: number | null;
}

export interface UsageCaps {
  readonly maxRuns?: number;
  readonly maxTokens?: number;
}

/** Fenêtre FIXE alignée (floor(now / windowMs)) ; le plafond le plus restrictif des niveaux gagne. */
export interface UsagePolicy {
  readonly windowMs: number;
  /** Taille de la liste bornée d'ids d'usage déjà comptés (D8). */
  readonly maxSeenIds: number;
  readonly organization?: UsageCaps;
  readonly project?: UsageCaps;
  readonly agent?: UsageCaps;
}

export interface QuotaScope {
  readonly organization: string;
  readonly project?: string;
  readonly agent?: string;
}

export interface Usage {
  readonly id: string;
  readonly scope: QuotaScope;
  readonly runs: number;
  readonly tokens: number;
}

export interface QuotaOptions {
  readonly expectedVersion?: number;
}
