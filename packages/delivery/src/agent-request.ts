/** Garde unique d'un runtime avant tout lancement. */
import { type FramedPrompt, isFramedPrompt } from "@koklo/domain";
import type { AgentRole } from "@koklo/rules";
import { snapshotAgentBudget } from "./agent-budget.ts";
import { isAgentCredential } from "./agent-credential.ts";
import { InvalidAgentRequestError } from "./agent-errors.ts";
import { AGENT_TRACE_PATTERN, type AgentSessionRequest, type AgentTrace } from "./agent-runtime.ts";
import { isAgentRole, snapshotToolPolicy } from "./agent-tools.ts";

/** Chemin POSIX absolu : ni racine seule, ni segment `..`, ni octet NUL. */
const isAbsolutePosix = (value: unknown): value is string =>
  typeof value === "string" &&
  value.startsWith("/") &&
  value !== "/" &&
  !value.includes("\0") &&
  !value.split("/").includes("..");

const isTraceValue = (value: unknown): value is string =>
  typeof value === "string" && AGENT_TRACE_PATTERN.test(value);

const snapshotTrace = (trace: unknown): AgentTrace | undefined => {
  if (typeof trace !== "object" || trace === null) {
    return undefined;
  }
  const { purpose, correlationId } = trace as Record<string, unknown>;
  return isTraceValue(purpose) && isTraceValue(correlationId)
    ? Object.freeze({ purpose, correlationId })
    : undefined;
};

type Fields = Partial<Record<keyof AgentSessionRequest, unknown>>;

/**
 * Retourne un instantané gelé en profondeur, chaque champ lu une seule fois (anti-TOCTOU).
 * Un signal déjà annulé n'est PAS une erreur : le runtime répond `aborted` sans lancer.
 */
export const assertSessionRequest = (request: AgentSessionRequest): AgentSessionRequest => {
  if (typeof request !== "object" || request === null) {
    throw new InvalidAgentRequestError("request");
  }
  const { role, prompt, worktree, tools, budget, signal, trace, credential } = request as Fields;
  if (!isAgentRole(role)) {
    throw new InvalidAgentRequestError("role");
  }
  if (!isFramedPrompt(prompt)) {
    throw new InvalidAgentRequestError("prompt");
  }
  if (!isAbsolutePosix(worktree)) {
    throw new InvalidAgentRequestError("worktree");
  }
  const policy = snapshotToolPolicy(role as AgentRole, tools);
  if (policy === undefined) {
    throw new InvalidAgentRequestError("tools");
  }
  if (!(signal instanceof AbortSignal)) {
    throw new InvalidAgentRequestError("signal");
  }
  const checkedTrace = snapshotTrace(trace);
  if (checkedTrace === undefined) {
    throw new InvalidAgentRequestError("trace");
  }
  if (credential !== undefined && !isAgentCredential(credential)) {
    throw new InvalidAgentRequestError("credential");
  }
  return Object.freeze({
    role,
    prompt: prompt as FramedPrompt,
    worktree,
    tools: policy,
    budget: snapshotAgentBudget(budget, prompt),
    signal,
    trace: checkedTrace,
    ...(credential === undefined ? {} : { credential }),
  });
};
