/** SQUELETTE (TK-59 Red) : table des erreurs `LLM_*` -> vue d'erreur (S-framing §4.5 à §4.9). */
export type AiErrorKind =
  | "not_configured"
  | "rate_limited"
  | "provider"
  | "output_invalid"
  | "prompt_rejected"
  | "encryption"
  | "not_found"
  | "forbidden"
  | "unauthorized"
  | "generic";

export interface AiErrorView {
  kind: AiErrorKind;
  /** Phrase principale de l'alerte. */
  message: string;
  /** Détail selon la raison (`missing`, `invalidated`, ...), ou `null`. */
  detail: string | null;
  /** Action proposée (« Demandez à un administrateur... »), ou `null`. */
  action: string | null;
  icon: "lock" | "schedule" | "warning";
  /** « Réessayer » est sûr. */
  retryable: boolean;
  /** `LLM_RATE_LIMITED` : secondes avant le prochain essai, sinon `null`. */
  retryAfterSeconds: number | null;
  /** `PROMPT_REJECTED` : `input` (idée, brief) ou `existing` (fonctionnalité du projet, non modifiable). */
  field: "input" | "existing" | null;
}

export function describeAiError(_error: unknown): AiErrorView {
  throw new Error("TK-59 : describeAiError n'est pas implémenté");
}

/** « 42 s » jusqu'à 60 s, au-delà « environ 2 min ». */
export function formatRetry(_seconds: number): string {
  throw new Error("TK-59 : formatRetry n'est pas implémenté");
}
