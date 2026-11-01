/** Port AgentRuntime : une session = une promesse = un résultat typé (pas de streaming public). */
import type { FramedPrompt } from "@koklo/domain";
import type { AgentRole } from "@koklo/rules";
import type { AgentBudget } from "./agent-budget.ts";
import type { AgentCredential } from "./agent-credential.ts";
import type { AgentOutput } from "./agent-output.ts";
import type { AgentToolPolicy } from "./agent-tools.ts";

export const AGENT_RUNTIME_IDS: readonly AgentRuntimeId[] = [];
export type AgentRuntimeId = "claude-code" | "fake";

/** Trace de journalisation : jamais de contenu (`/^[A-Za-z0-9._:-]{1,64}$/`). */
export const AGENT_TRACE_PATTERN = /^$/;

export interface AgentTrace {
  readonly purpose: string;
  readonly correlationId: string;
}

export interface AgentSessionRequest {
  readonly role: AgentRole;
  readonly prompt: FramedPrompt;
  /** Chemin POSIX absolu d'un worktree fourni par le runner (le port n'en crée pas). */
  readonly worktree: string;
  readonly tools: AgentToolPolicy;
  readonly budget: AgentBudget;
  readonly signal: AbortSignal;
  readonly trace: AgentTrace;
  readonly credential?: AgentCredential;
}

export const AGENT_FAILURE_REASONS: readonly AgentFailureReason[] = [];
export type AgentFailureReason =
  | "agent_error"
  | "tool_denied"
  | "invalid_output"
  | "process_error"
  | "budget_exceeded";

export interface AgentUsage {
  readonly costMicroUsd: number;
  readonly durationMs: number;
}

export const AGENT_RESULT_STATUSES: readonly AgentSessionResult["status"][] = [];

export type AgentSessionResult =
  | { readonly status: "completed"; readonly output: AgentOutput; readonly usage: AgentUsage }
  | {
      readonly status: "failed";
      readonly reason: AgentFailureReason;
      readonly output: AgentOutput;
    }
  | { readonly status: "timeout"; readonly output: AgentOutput }
  | { readonly status: "aborted"; readonly output: AgentOutput }
  | {
      readonly status: "quota";
      readonly output: AgentOutput;
      readonly retryAfterMs?: number;
    };

export interface AgentRuntime {
  readonly id: AgentRuntimeId;
  launchSession(request: AgentSessionRequest): Promise<AgentSessionResult>;
}

/** Seul `failed` compte comme échec : timeout, aborted et quota ont leur propre statut. */
export const countsAsAgentFailure = (_result: AgentSessionResult): boolean => {
  throw new Error("not implemented");
};
