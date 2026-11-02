/** Traduit l'issue d'un processus en résultat typé du port (sortie redigée et bornée). */
import { AgentAuthError } from "../agent-errors.ts";
import { type AgentOutput, agentOutput } from "../agent-output.ts";
import type { AgentSessionResult } from "../agent-runtime.ts";
import { QUOTA_MAX_BACKOFF_MS } from "../quota-check.ts";
import type { QuotaSignal } from "../quota-signal.ts";
import { describeClaudeFailure } from "./classify.ts";
import type { ProcessOutcome } from "./process.ts";
import { redactSecrets } from "./redact.ts";

export interface OutcomeContext {
  readonly maxOutputChars: number;
  readonly knownSecrets: readonly string[];
  readonly durationMs: number;
}

const safeOutput = (text: string, context: OutcomeContext): AgentOutput =>
  agentOutput(redactSecrets(text, context.knownSecrets).slice(0, context.maxOutputChars));

const partialText = (outcome: ProcessOutcome): string => outcome.stream.assistantTexts.join("\n");

const stopped = (outcome: ProcessOutcome, context: OutcomeContext): AgentSessionResult => {
  const output = safeOutput(partialText(outcome), context);
  switch (outcome.stopped) {
    case "timeout":
      return { status: "timeout", output };
    case "aborted":
      return { status: "aborted", output };
    default:
      return { status: "failed", reason: "budget_exceeded", output };
  }
};

/** Délai de reprise du fournisseur, entier dans [0, 24 h] ; sinon (négatif, NaN, démesuré) borné ou absent. */
const quotaDelayMs = (quota: QuotaSignal, now: number): number | null => {
  const delay =
    quota.retryAfterMs ??
    (quota.resetAt !== null && quota.resetAt > now ? quota.resetAt - now : null);
  if (delay === null || !Number.isFinite(delay) || delay < 0) return null;
  return Math.min(Math.floor(delay), QUOTA_MAX_BACKOFF_MS);
};

const failure = (outcome: ProcessOutcome, context: OutcomeContext): AgentSessionResult => {
  const result = outcome.stream.result;
  const resultIsError = result?.isError === true;
  const raw = [outcome.stderr, resultIsError ? result.text : ""].filter(Boolean).join("\n");
  const failed = describeClaudeFailure(raw, { exitCode: outcome.exitCode, resultIsError });
  if (failed.kind === "auth") {
    throw new AgentAuthError({ operation: "session", runtime: "claude-code" });
  }
  const output = safeOutput(raw, context);
  if (failed.kind === "quota") {
    const retryAfterMs = quotaDelayMs(failed.quota, Date.now());
    return retryAfterMs === null
      ? { status: "quota", output }
      : { status: "quota", output, retryAfterMs };
  }
  return { status: "failed", reason: failed.kind, output };
};

export const toSessionResult = (
  outcome: ProcessOutcome,
  context: OutcomeContext,
): AgentSessionResult => {
  if (outcome.stopped !== undefined) {
    return stopped(outcome, context);
  }
  const result = outcome.stream.result;
  if (result !== undefined && !result.isError) {
    return {
      status: "completed",
      output: safeOutput(result.text, context),
      usage: { costMicroUsd: result.costMicroUsd, durationMs: context.durationMs },
    };
  }
  return failure(outcome, context);
};
