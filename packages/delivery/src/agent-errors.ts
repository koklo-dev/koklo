/** Erreurs typées du port AgentRuntime : aucune ne porte clé, prompt, sortie ni `cause`. */
import type { AgentRuntimeId } from "./agent-runtime.ts";

export interface AgentErrorDiagnostic {
  readonly operation: string;
  readonly runtime?: AgentRuntimeId;
}

export const INVALID_AGENT_REQUEST_REASONS: readonly InvalidAgentRequestReason[] = [];
export type InvalidAgentRequestReason =
  | "request"
  | "role"
  | "prompt"
  | "worktree"
  | "tools"
  | "budget"
  | "signal"
  | "trace"
  | "credential";

export const INVALID_AGENT_BUDGET_FIELDS: readonly InvalidAgentBudgetField[] = [];
export type InvalidAgentBudgetField =
  | "budget"
  | "timeoutMs"
  | "maxCostMicroUsd"
  | "maxOutputChars"
  | "maxPromptChars";

export const AGENT_BUDGET_LIMITS: readonly AgentBudgetLimit[] = [];
export type AgentBudgetLimit = "timeout" | "cost" | "output-chars" | "prompt-chars";

export const INVALID_AGENT_CREDENTIAL_REASONS: readonly InvalidAgentCredentialReason[] = [];
export type InvalidAgentCredentialReason =
  | "not-a-string"
  | "empty"
  | "too-long"
  | "control-characters";

export class AgentRuntimeError extends Error {
  declare readonly operation: string;
  declare readonly runtime?: AgentRuntimeId;
  constructor(_diagnostic: AgentErrorDiagnostic, message = "Erreur du runtime d'agent") {
    super(message);
  }
}

export class InvalidAgentRequestError extends AgentRuntimeError {
  declare readonly reason: InvalidAgentRequestReason;
  constructor(_reason: InvalidAgentRequestReason) {
    super({ operation: "guard" });
  }
}

export class InvalidAgentBudgetError extends AgentRuntimeError {
  declare readonly field: InvalidAgentBudgetField;
  constructor(_field: InvalidAgentBudgetField) {
    super({ operation: "guard" });
  }
}

export class AgentBudgetExceededError extends AgentRuntimeError {
  declare readonly limit: AgentBudgetLimit;
  constructor(_limit: AgentBudgetLimit) {
    super({ operation: "guard" });
  }
}

export class AgentRuntimeUnavailableError extends AgentRuntimeError {
  constructor(diagnostic: AgentErrorDiagnostic) {
    super(diagnostic);
  }
}

export class AgentAuthError extends AgentRuntimeError {
  constructor(diagnostic: AgentErrorDiagnostic) {
    super(diagnostic);
  }
}

export class InvalidAgentCredentialError extends Error {
  declare readonly reason: InvalidAgentCredentialReason;
  constructor(_reason: InvalidAgentCredentialReason) {
    super("Clé d'agent invalide");
  }
}
