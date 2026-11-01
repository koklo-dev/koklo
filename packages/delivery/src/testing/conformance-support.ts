/** Aides des cas de conformité : requêtes de référence, attentes qui lèvent `AgentConformanceFailure`. */
import { framePrompt, trusted, Untrusted } from "@koklo/domain";
import type { AgentRole } from "@koklo/rules";
import type { AgentBudget } from "../agent-budget.ts";
import { agentCredential } from "../agent-credential.ts";
import type { AgentSessionRequest, AgentSessionResult } from "../agent-runtime.ts";
import { toolsForRole } from "../agent-tools.ts";
import { AgentConformanceFailure, type AgentConformanceSubject } from "./conformance-types.ts";

export const PROMPT_SENTINEL = "PROMPT-CONFORMANCE-SENTINEL";
export const OUTPUT_SENTINEL = "OUTPUT-CONFORMANCE-SENTINEL";

export const BUDGET: AgentBudget = {
  timeoutMs: 600_000,
  maxCostMicroUsd: 2_000_000,
  maxOutputChars: 1_000,
  maxPromptChars: 50_000,
};

export function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new AgentConformanceFailure(message);
  }
}

/** Requête valide de référence ; `overrides` écrase des champs (parfois par des valeurs invalides). */
export const requestFor = (
  subject: AgentConformanceSubject,
  overrides: Record<string, unknown> = {},
  signal: AbortSignal = new AbortController().signal,
): AgentSessionRequest => {
  const role: AgentRole = "developer";
  return {
    role,
    prompt: framePrompt({
      instructions: trusted`Réalise le ticket.`,
      data: [new Untrusted("ticket-comment", PROMPT_SENTINEL)],
      nonce: "k3Zq9TxW7mB2vLpD",
    }),
    worktree: "/work/conformance",
    tools: toolsForRole(role),
    budget: BUDGET,
    signal,
    trace: { purpose: "conformance", correlationId: "case-0001" },
    credential: agentCredential(subject.validKey),
    ...overrides,
  } as AgentSessionRequest;
};

/** Rejet de la promesse, ou `undefined` si elle se résout. */
export const rejectionOf = async (call: Promise<unknown>): Promise<unknown> => {
  try {
    await call;
  } catch (error) {
    return error;
  }
  return undefined;
};

export const launch = (
  subject: AgentConformanceSubject,
  overrides: Record<string, unknown> = {},
): Promise<AgentSessionResult> => subject.runtime.launchSession(requestFor(subject, overrides));

/** Tout rendu observable d'une valeur (message, JSON, pile) pour la recherche de fuites. */
export const renderings = (value: unknown): string => {
  const error =
    value instanceof Error ? `${value.message}${value.stack ?? ""}${String(value)}` : "";
  return `${error}${JSON.stringify(value) ?? ""}${String(value)}`;
};
