import { isLlmServingProviderId, type LlmServingProviderId } from "./llm-provider-id.ts";

export const LLM_PROVIDER_ERROR_NAMES = [
  "LlmAuthError",
  "LlmRateLimitedError",
  "LlmQuotaExceededError",
  "LlmTimeoutError",
  "LlmAbortedError",
  "LlmBudgetExceededError",
  "LlmContextTooLongError",
  "LlmRefusedError",
  "LlmModelNotFoundError",
  "LlmProviderUnavailableError",
  "LlmInvalidOutputError",
] as const;

export type LlmProviderErrorName = (typeof LLM_PROVIDER_ERROR_NAMES)[number];

export interface LlmErrorDiagnostic {
  readonly operation: string;
  readonly provider?: LlmServingProviderId;
  readonly status?: number;
}

export const LLM_BUDGET_LIMITS = ["output-tokens", "timeout", "cost", "prompt-chars"] as const;
export type LlmBudgetLimit = (typeof LLM_BUDGET_LIMITS)[number];

/** Plafond de `retryAfterMs` (TK-50c) : une heure. */
export const LLM_MAX_RETRY_AFTER_MS = 3_600_000;

const OPERATION_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const MIN_STATUS = 100;
const MAX_STATUS = 599;

/** Racine des erreurs du port LLM ; aucune ne porte clé, prompt, sortie ni `cause`. */
export class LlmProviderError extends Error {
  declare readonly operation: string;
  declare readonly provider?: LlmServingProviderId;
  declare readonly status?: number;

  /** Ne reprend que des champs connus et valides ; tout autre champ passé est ignoré. */
  constructor(diagnostic: LlmErrorDiagnostic, message = "Erreur du fournisseur LLM") {
    super(message);
    this.name = "LlmProviderError";
    const { operation, provider, status } = diagnostic ?? ({} as Partial<LlmErrorDiagnostic>);
    this.operation =
      typeof operation === "string" && OPERATION_PATTERN.test(operation) ? operation : "unknown";
    if (isLlmServingProviderId(provider)) {
      this.provider = provider;
    }
    if (Number.isInteger(status) && Number(status) >= MIN_STATUS && Number(status) <= MAX_STATUS) {
      this.status = status as number;
    }
  }
}

export class LlmAuthError extends LlmProviderError {
  constructor(diagnostic: LlmErrorDiagnostic) {
    super(diagnostic, "Clé du fournisseur LLM refusée");
    this.name = "LlmAuthError";
  }
}

export class LlmRateLimitedError extends LlmProviderError {
  readonly retryAfterMs: number;
  constructor(input: LlmErrorDiagnostic & { retryAfterMs: number }) {
    super(input, "Limite de débit du fournisseur LLM atteinte");
    this.name = "LlmRateLimitedError";
    const retryAfterMs = input?.retryAfterMs;
    this.retryAfterMs =
      typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0
        ? Math.min(Math.trunc(retryAfterMs), LLM_MAX_RETRY_AFTER_MS)
        : 0;
  }
}

export class LlmQuotaExceededError extends LlmProviderError {
  constructor(diagnostic: LlmErrorDiagnostic) {
    super(diagnostic, "Quota du fournisseur LLM épuisé");
    this.name = "LlmQuotaExceededError";
  }
}

export class LlmTimeoutError extends LlmProviderError {
  constructor(diagnostic: LlmErrorDiagnostic) {
    super(diagnostic, "Délai du fournisseur LLM dépassé");
    this.name = "LlmTimeoutError";
  }
}

export class LlmAbortedError extends LlmProviderError {
  constructor(diagnostic: LlmErrorDiagnostic) {
    super(diagnostic, "Appel au fournisseur LLM annulé");
    this.name = "LlmAbortedError";
  }
}

export class LlmBudgetExceededError extends LlmProviderError {
  readonly limit: LlmBudgetLimit;
  constructor(input: LlmErrorDiagnostic & { limit: LlmBudgetLimit }) {
    super(input, "Budget de l'appel LLM dépassé");
    this.name = "LlmBudgetExceededError";
    this.limit = (LLM_BUDGET_LIMITS as readonly unknown[]).includes(input?.limit)
      ? input.limit
      : "cost";
  }
}

export class LlmContextTooLongError extends LlmProviderError {
  constructor(diagnostic: LlmErrorDiagnostic) {
    super(diagnostic, "Contexte trop long pour le modèle LLM");
    this.name = "LlmContextTooLongError";
  }
}

export class LlmRefusedError extends LlmProviderError {
  constructor(diagnostic: LlmErrorDiagnostic) {
    super(diagnostic, "Requête refusée par le modèle LLM");
    this.name = "LlmRefusedError";
  }
}

export class LlmModelNotFoundError extends LlmProviderError {
  constructor(diagnostic: LlmErrorDiagnostic) {
    super(diagnostic, "Modèle LLM introuvable chez le fournisseur");
    this.name = "LlmModelNotFoundError";
  }
}

export class LlmProviderUnavailableError extends LlmProviderError {
  constructor(diagnostic: LlmErrorDiagnostic) {
    super(diagnostic, "Fournisseur LLM indisponible");
    this.name = "LlmProviderUnavailableError";
  }
}
