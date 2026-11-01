/** Faux AgentRuntime scripté et déterministe : ni horloge, ni aléa, ni timer, ni processus. */
import type { FramedPrompt } from "@koklo/domain";
import type { AgentRole } from "@koklo/rules";
import type { AgentBudget } from "../agent-budget.ts";
import type { AgentRuntimeError } from "../agent-errors.ts";
import { agentOutput } from "../agent-output.ts";
import { assertSessionRequest } from "../agent-request.ts";
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

export class FakeAgentScriptExhaustedError extends Error {
  constructor() {
    super("Le script du faux runtime d'agent est épuisé");
    this.name = "FakeAgentScriptExhaustedError";
  }
}

const isFailure = (step: FakeAgentStep): step is FakeAgentFailure => "fail" in step;

/** Sortie non fiable tronquée à `maxOutputChars` ; une sortie omise vaut la chaîne vide. */
const outputOf = (text: string | undefined, budget: AgentBudget) =>
  agentOutput((text ?? "").slice(0, budget.maxOutputChars));

type SettledStatus = "failed" | "timeout" | "aborted" | "quota";

const finish = (
  status: SettledStatus,
  text: string | undefined,
  budget: AgentBudget,
  extra: object = {},
): AgentSessionResult =>
  ({ status, output: outputOf(text, budget), ...extra }) as AgentSessionResult;

/** Applique les règles du budget à une étape `completed` : durée, puis coût. */
const settleCompleted = (
  step: Extract<FakeAgentOutcome, { status: "completed" }>,
  budget: AgentBudget,
): AgentSessionResult => {
  const durationMs = step.elapsedMs ?? 0;
  const costMicroUsd = step.costMicroUsd ?? 0;
  if (durationMs > budget.timeoutMs) {
    return finish("timeout", step.output, budget);
  }
  if (costMicroUsd > budget.maxCostMicroUsd) {
    return finish("failed", step.output, budget, { reason: "budget_exceeded" });
  }
  return {
    status: "completed",
    output: outputOf(step.output, budget),
    usage: { costMicroUsd, durationMs },
  };
};

const settle = (
  step: Exclude<FakeAgentOutcome, { status: "hang" }>,
  budget: AgentBudget,
): AgentSessionResult => {
  switch (step.status) {
    case "completed":
      return settleCompleted(step, budget);
    case "failed":
      return finish("failed", step.output, budget, { reason: step.reason ?? "agent_error" });
    case "quota": {
      const retry = step.retryAfterMs === undefined ? {} : { retryAfterMs: step.retryAfterMs };
      return finish("quota", step.output, budget, retry);
    }
    default:
      return finish(step.status, step.output, budget);
  }
};

/** Session qui ne rend la main que si le signal est annulé : aucun timer. */
const hangUntilAborted = (signal: AbortSignal, budget: AgentBudget): Promise<AgentSessionResult> =>
  new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(finish("aborted", "", budget)), { once: true });
  });

export class FakeAgentRuntime implements AgentRuntime {
  readonly id = "fake" as const;
  readonly #queue: FakeAgentStep[] = [];
  readonly #recorded: FakeAgentCall[] = [];
  #repeat: FakeAgentStep | undefined;

  /** Répond toujours `completed` avec cette sortie. */
  static replying(output: string): FakeAgentRuntime {
    return FakeAgentRuntime.repeating({ status: "completed", output });
  }

  /** Lève toujours cette erreur typée. */
  static failing(error: AgentRuntimeError): FakeAgentRuntime {
    return FakeAgentRuntime.repeating({ fail: error });
  }

  static repeating(step: FakeAgentStep): FakeAgentRuntime {
    const fake = new FakeAgentRuntime();
    fake.#repeat = step;
    return fake;
  }

  script(steps: readonly FakeAgentStep[]): this {
    this.#queue.push(...steps);
    return this;
  }

  get calls(): readonly FakeAgentCall[] {
    return [...this.#recorded];
  }

  async launchSession(request: AgentSessionRequest): Promise<AgentSessionResult> {
    const snapshot = assertSessionRequest(request);
    if (snapshot.signal.aborted) {
      return finish("aborted", "", snapshot.budget);
    }
    this.#record(snapshot);
    const step = this.#queue.shift() ?? this.#repeat;
    if (step === undefined) {
      throw new FakeAgentScriptExhaustedError();
    }
    if (isFailure(step)) {
      throw step.fail;
    }
    if (step.status === "hang") {
      return hangUntilAborted(snapshot.signal, snapshot.budget);
    }
    return settle(step, snapshot.budget);
  }

  #record(snapshot: AgentSessionRequest): void {
    const { role, prompt, worktree, tools, budget, trace } = snapshot;
    this.#recorded.push(
      Object.freeze({
        role,
        prompt,
        worktree,
        tools,
        budget,
        trace,
        credentialProvided: snapshot.credential !== undefined,
      }),
    );
  }
}
