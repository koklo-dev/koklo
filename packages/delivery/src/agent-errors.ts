/** Erreurs typées du port AgentRuntime : aucune ne porte clé, prompt, sortie ni `cause`. */
import { AGENT_RUNTIME_IDS, type AgentRuntimeId } from "./agent-runtime.ts";

export interface AgentErrorDiagnostic {
  readonly operation: string;
  readonly runtime?: AgentRuntimeId;
}

export const INVALID_AGENT_REQUEST_REASONS = [
  "request",
  "role",
  "prompt",
  "worktree",
  "tools",
  "budget",
  "signal",
  "trace",
  "credential",
] as const;
export type InvalidAgentRequestReason = (typeof INVALID_AGENT_REQUEST_REASONS)[number];

export const INVALID_AGENT_BUDGET_FIELDS = [
  "budget",
  "timeoutMs",
  "maxCostMicroUsd",
  "maxOutputChars",
  "maxPromptChars",
] as const;
export type InvalidAgentBudgetField = (typeof INVALID_AGENT_BUDGET_FIELDS)[number];

export const AGENT_BUDGET_LIMITS = ["timeout", "cost", "output-chars", "prompt-chars"] as const;
export type AgentBudgetLimit = (typeof AGENT_BUDGET_LIMITS)[number];

export const INVALID_AGENT_CREDENTIAL_REASONS = [
  "not-a-string",
  "empty",
  "too-long",
  "control-characters",
] as const;
export type InvalidAgentCredentialReason = (typeof INVALID_AGENT_CREDENTIAL_REASONS)[number];

const OPERATION_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/** Nomme l'erreur sans propriété énumérable : `Object.keys` ne montre que les champs connus. */
const nameError = (error: Error, name: string): void => {
  Object.defineProperty(error, "name", { value: name, configurable: true, writable: true });
};

/** Racine : seuls `operation` et `runtime` (valeurs sûres) sont conservés, jamais de `cause`. */
export class AgentRuntimeError extends Error {
  declare readonly operation: string;
  declare readonly runtime?: AgentRuntimeId;

  constructor(diagnostic: AgentErrorDiagnostic, message = "Erreur du runtime d'agent") {
    super(message);
    const { operation, runtime } = diagnostic ?? {};
    nameError(this, new.target.name);
    this.operation =
      typeof operation === "string" && OPERATION_PATTERN.test(operation) ? operation : "unknown";
    if ((AGENT_RUNTIME_IDS as readonly unknown[]).includes(runtime)) {
      this.runtime = runtime;
    }
  }
}

/** Requête mal formée (erreur de programmation de l'appelant) ; ne reprend aucun contenu. */
export class InvalidAgentRequestError extends AgentRuntimeError {
  declare readonly reason: InvalidAgentRequestReason;
  constructor(reason: InvalidAgentRequestReason) {
    super({ operation: "guard" }, `Requête d'agent invalide : ${reason}`);
    this.reason = reason;
  }
}

/** Budget absent ou champ qui n'est pas un entier strictement positif. */
export class InvalidAgentBudgetError extends AgentRuntimeError {
  declare readonly field: InvalidAgentBudgetField;
  constructor(field: InvalidAgentBudgetField) {
    super({ operation: "guard" }, `Budget d'agent invalide : ${field}`);
    this.field = field;
  }
}

/** Budget au-dessus d'un plafond du domaine, ou prompt plus long que le budget. */
export class AgentBudgetExceededError extends AgentRuntimeError {
  declare readonly limit: AgentBudgetLimit;
  constructor(limit: AgentBudgetLimit) {
    super({ operation: "guard" }, `Budget d'agent dépassé : ${limit}`);
    this.limit = limit;
  }
}

/** Runtime injoignable ou binaire absent (jamais un échec de l'agent). */
export class AgentRuntimeUnavailableError extends AgentRuntimeError {
  constructor(diagnostic: AgentErrorDiagnostic) {
    super(diagnostic, "Runtime d'agent indisponible");
  }
}

/** Authentification refusée par le runtime (clé ou abonnement). */
export class AgentAuthError extends AgentRuntimeError {
  constructor(diagnostic: AgentErrorDiagnostic) {
    super(diagnostic, "Authentification du runtime d'agent refusée");
  }
}

/** Clé inutilisable ; ne reprend jamais la valeur fournie. */
export class InvalidAgentCredentialError extends Error {
  readonly reason: InvalidAgentCredentialReason;
  constructor(reason: InvalidAgentCredentialReason) {
    super("Clé d'agent invalide");
    nameError(this, "InvalidAgentCredentialError");
    this.reason = reason;
  }
}
