/** Faux AgentRuntime scripté et déterministe : ni horloge, ni aléa, ni timer, ni processus. */
import type { FramedPrompt } from "@koklo/domain";
import type { AgentRole } from "@koklo/rules";
import type { AgentBudget } from "../agent-budget.ts";
import type { AgentRuntimeError } from "../agent-errors.ts";
import type {
  AgentFailureReason,
  AgentRuntime,
  AgentSessionRequest,
  AgentSessionResult,
  AgentTrace,
} from "../agent-runtime.ts";
import type { AgentToolPolicy } from "../agent-tools.ts";

export type FakeAgentOutcome =
  | {
      readonly status: "completed";
      readonly output: string;
      readonly costMicroUsd?: number;
      readonly elapsedMs?: number;
    }
  | { readonly status: "failed"; readonly reason?: AgentFailureReason; readonly output?: string }
  | { readonly status: "timeout"; readonly output?: string }
  | { readonly status: "quota"; readonly output?: string; readonly retryAfterMs?: number }
  | { readonly status: "aborted"; readonly output?: string }
  | { readonly status: "hang" };
export type FakeAgentFailure = { readonly fail: AgentRuntimeError };
export type FakeAgentStep = FakeAgentOutcome | FakeAgentFailure;

/** Appel enregistré : jamais la clé (`credential` absent par construction). */
export interface FakeAgentCall {
  readonly role: AgentRole;
  readonly prompt: FramedPrompt;
  readonly worktree: string;
  readonly tools: AgentToolPolicy;
  readonly budget: AgentBudget;
  readonly trace: AgentTrace;
  readonly credentialProvided: boolean;
}

export class FakeAgentScriptExhaustedError extends Error {}

export class FakeAgentRuntime implements AgentRuntime {
  readonly id = "fake" as const;
  static replying(_output: string): FakeAgentRuntime {
    throw new Error("not implemented");
  }
  static failing(_error: AgentRuntimeError): FakeAgentRuntime {
    throw new Error("not implemented");
  }
  script(_steps: readonly FakeAgentStep[]): this {
    throw new Error("not implemented");
  }
  get calls(): readonly FakeAgentCall[] {
    throw new Error("not implemented");
  }
  launchSession(_request: AgentSessionRequest): Promise<AgentSessionResult> {
    throw new Error("not implemented");
  }
}
