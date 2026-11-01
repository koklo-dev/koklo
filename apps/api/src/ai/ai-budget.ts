import type { LlmBudget } from "@koklo/domain";

/** Finalités fixes (`trace.purpose`) : une par procédure. */
export type AiPurpose =
  | "brief-draft"
  | "features-propose"
  | "criteria-propose"
  | "credential-verify";

/** Plafonds par défaut du quota (D8, à valider par l'humain) ; réglables par `AppConfig.ai`. */
export interface AiLimits {
  /** Appels `ai.*` par organisation et par heure glissante (lignes d'audit `ai.%`). */
  readonly maxCallsPerHourOrg: number;
  /** Appels `ai.*` par utilisateur et par heure glissante. */
  readonly maxCallsPerHourUser: number;
  /** Appels `llmCredential.verify` par organisation et par heure glissante (lignes `llm_credential.verify`). */
  readonly maxVerifyPerHourOrg: number;
  /** Appels simultanés par organisation et par processus (sémaphore). */
  readonly maxConcurrentPerOrg: number;
}

export const AI_LIMIT_DEFAULTS: AiLimits = {
  maxCallsPerHourOrg: 30,
  maxCallsPerHourUser: 10,
  maxVerifyPerHourOrg: 5,
  maxConcurrentPerOrg: 2,
};

/** Fenêtre glissante des quotas, en secondes. */
export const AI_WINDOW_SECONDS = 3600;

const COMMON = { maxPromptChars: 60_000, maxCostMicroUsd: 500_000 } as const;

/** Budget serveur par appel : jamais lu de l'entrée, toujours sous les plafonds du domaine. */
export const AI_BUDGETS: Readonly<Record<AiPurpose, LlmBudget>> = {
  "features-propose": { maxOutputTokens: 4000, timeoutMs: 60_000, ...COMMON },
  "brief-draft": { maxOutputTokens: 1500, timeoutMs: 60_000, ...COMMON },
  "criteria-propose": { maxOutputTokens: 1500, timeoutMs: 60_000, ...COMMON },
  "credential-verify": { maxOutputTokens: 16, timeoutMs: 15_000, ...COMMON },
};

/** Nombre maximal de features existantes (lignes) transmises au modèle comme contexte. */
export const AI_FEATURES_MAX_LISTED = 100;
