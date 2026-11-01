import { framePrompt, trusted, Untrusted } from "@koklo/domain";
import {
  type AgentBudget,
  type AgentSessionRequest,
  agentCredential,
  toolsForRole,
} from "../src/index.ts";

/** Sentinelles : les tests de non-fuite les cherchent partout. */
export const SECRET_KEY = "sk-ant-SENTINELLE-0123456789";
export const PROMPT_TEXT = "Donnees sensibles PROMPT-SENTINELLE";
export const OUTPUT_TEXT = "OUTPUT-SENTINELLE du modele";
export const NONCE = "k3Zq9TxW7mB2vLpD";
export const WORKTREE = "/work/koklo/tk-73";

export const BUDGET: AgentBudget = {
  timeoutMs: 600_000,
  maxCostMicroUsd: 2_000_000,
  maxOutputChars: 20_000,
  maxPromptChars: 50_000,
};

export const makePrompt = (text = PROMPT_TEXT) =>
  framePrompt({
    instructions: trusted`Implemente le ticket.`,
    data: [new Untrusted("ticket-comment", text)],
    nonce: NONCE,
  });

/** Requete valide (role developer) ; chaque test en derive une variante. */
export const makeRequest = (overrides: Record<string, unknown> = {}): AgentSessionRequest =>
  ({
    role: "developer",
    prompt: makePrompt(),
    worktree: WORKTREE,
    tools: toolsForRole("developer"),
    budget: BUDGET,
    signal: new AbortController().signal,
    trace: { purpose: "dev-session", correlationId: "run-0001" },
    credential: agentCredential(SECRET_KEY),
    ...overrides,
  }) as AgentSessionRequest;

export const reviewerRequest = (overrides: Record<string, unknown> = {}): AgentSessionRequest =>
  makeRequest({ role: "qa-reviewer", tools: toolsForRole("qa-reviewer"), ...overrides });

/** Erreur levee (synchrone) par `fn`, ou `undefined`. */
export const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

/** Requete dont chaque champ est un accesseur compteur : toute double lecture se voit. */
export const countingRequest = (base: AgentSessionRequest) => {
  const reads: Record<string, number> = {};
  const wrap = (path: string, value: unknown): unknown => {
    if (typeof value !== "object" || value === null || value instanceof AbortSignal) {
      return value;
    }
    if (Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      const full = `${path}${key}`;
      Object.defineProperty(out, key, {
        enumerable: true,
        get: () => {
          reads[full] = (reads[full] ?? 0) + 1;
          return wrap(`${full}.`, inner);
        },
      });
    }
    return out;
  };
  return { request: wrap("", base) as AgentSessionRequest, reads };
};
