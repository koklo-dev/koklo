/** Traduit l'issue d'un processus en résultat typé du port (sortie redigée et bornée). */
import { AgentAuthError } from "../agent-errors.ts";
import { type AgentOutput, agentOutput } from "../agent-output.ts";
import type { AgentSessionResult } from "../agent-runtime.ts";
import { classifyClaudeFailure } from "./classify.ts";
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

const failure = (outcome: ProcessOutcome, context: OutcomeContext): AgentSessionResult => {
  const result = outcome.stream.result;
  const resultIsError = result?.isError === true;
  const raw = [outcome.stderr, resultIsError ? result.text : ""].filter(Boolean).join("\n");
  const kind = classifyClaudeFailure(raw, { exitCode: outcome.exitCode, resultIsError });
  if (kind === "auth") {
    throw new AgentAuthError({ operation: "session", runtime: "claude-code" });
  }
  const output = safeOutput(raw, context);
  if (kind === "quota") {
    return { status: "quota", output };
  }
  return { status: "failed", reason: kind, output };
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
