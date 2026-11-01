/** Les 14 cas de conformité d'un AgentRuntime, dans l'ordre figé. */
import { revealUntrusted } from "@koklo/domain";
import { AGENT_MAX_TIMEOUT_MS, type AgentBudget } from "../agent-budget.ts";
import {
  AgentAuthError,
  AgentBudgetExceededError,
  AgentRuntimeUnavailableError,
  InvalidAgentBudgetError,
  InvalidAgentRequestError,
} from "../agent-errors.ts";
import { isAgentOutput } from "../agent-output.ts";
import { AGENT_FAILURE_REASONS, countsAsAgentFailure } from "../agent-runtime.ts";
import { toolsForRole } from "../agent-tools.ts";
import {
  BUDGET,
  ensure,
  launch,
  OUTPUT_SENTINEL,
  PROMPT_SENTINEL,
  rejectionOf,
  renderings,
  requestFor,
} from "./conformance-support.ts";
import type {
  AgentConformanceCase,
  AgentConformanceFactory,
  AgentConformanceSubject,
} from "./conformance-types.ts";

type CaseBody = (
  subject: AgentConformanceSubject,
  factory: AgentConformanceFactory,
) => Promise<void>;

const textOf = (result: { output: Parameters<typeof revealUntrusted>[0] }): string =>
  revealUntrusted(result.output);

/** Refus avant tout lancement : une erreur typée de la garde, et aucune session lancée. */
const expectGuardRefusal = async (
  subject: AgentConformanceSubject,
  overrides: Record<string, unknown>,
  type: new (...args: never[]) => Error,
  what: string,
): Promise<void> => {
  await subject.replyWith("ne doit jamais être lancée");
  const error = await rejectionOf(launch(subject, overrides));
  ensure(error instanceof type, `${what} : refus attendu (${type.name})`);
  ensure(subject.launchesMade() === 0, `${what} : une session a été lancée`);
};

const returnsUntrustedOutput: CaseBody = async (subject) => {
  await subject.replyWith("bonjour");
  const result = await launch(subject);
  ensure(result.status === "completed", "une session nominale doit être `completed`");
  ensure(isAgentOutput(result.output), "la sortie doit être Untrusted('model-output')");
  ensure(textOf(result) === "bonjour", "la sortie doit être celle de l'agent");
  const { costMicroUsd, durationMs } = result.usage;
  ensure(Number.isFinite(costMicroUsd) && costMicroUsd >= 0, "coût de l'usage invalide");
  ensure(Number.isFinite(durationMs) && durationMs >= 0, "durée de l'usage invalide");
};

const refusesRawPrompt: CaseBody = async (subject) =>
  expectGuardRefusal(subject, { prompt: "prompt brut" }, InvalidAgentRequestError, "prompt brut");

const refusesRelativeWorktree: CaseBody = async (subject) =>
  expectGuardRefusal(
    subject,
    { worktree: "relatif/chemin" },
    InvalidAgentRequestError,
    "worktree relatif",
  );

const refusesInvalidBudget: CaseBody = async (subject) => {
  const budget = (change: Partial<AgentBudget>) => ({ ...BUDGET, ...change });
  await expectGuardRefusal(
    subject,
    { budget: undefined },
    InvalidAgentBudgetError,
    "budget absent",
  );
  await expectGuardRefusal(
    subject,
    { budget: budget({ timeoutMs: 0 }) },
    InvalidAgentBudgetError,
    "budget nul",
  );
  await expectGuardRefusal(
    subject,
    { budget: budget({ timeoutMs: AGENT_MAX_TIMEOUT_MS + 1 }) },
    AgentBudgetExceededError,
    "budget au-dessus du plafond",
  );
};

const refusesWriteForReadOnlyRole: CaseBody = async (subject) =>
  expectGuardRefusal(
    subject,
    { role: "qa-reviewer", tools: toolsForRole("developer") },
    InvalidAgentRequestError,
    "écriture pour un rôle en lecture seule",
  );

const capsOutput: CaseBody = async (subject) => {
  await subject.replyWith("x".repeat(BUDGET.maxOutputChars * 5));
  const result = await launch(subject);
  ensure(result.status === "completed", "la sortie trop longue doit être tronquée, pas refusée");
  ensure(textOf(result).length <= BUDGET.maxOutputChars, "la sortie dépasse maxOutputChars");
};

const abortedBeforeLaunch: CaseBody = async (subject) => {
  const controller = new AbortController();
  controller.abort();
  await subject.replyWith("ne doit jamais être lancée");
  const result = await subject.runtime.launchSession(requestFor(subject, {}, controller.signal));
  ensure(result.status === "aborted", "un signal déjà annulé doit rendre `aborted`");
  ensure(isAgentOutput(result.output), "la sortie `aborted` doit rester non fiable");
  ensure(subject.launchesMade() === 0, "une session a été lancée malgré le signal annulé");
};

const abortedDuringSession: CaseBody = async (subject) => {
  const controller = new AbortController();
  await subject.hangUntilAborted();
  const pending = subject.runtime.launchSession(requestFor(subject, {}, controller.signal));
  await Promise.resolve();
  controller.abort();
  const result = await pending;
  ensure(result.status === "aborted", "l'annulation en cours de session doit rendre `aborted`");
};

const timeoutIsItsOwnStatus: CaseBody = async (subject) => {
  await subject.trigger("timeout", "sortie partielle");
  const result = await launch(subject);
  ensure(result.status === "timeout", "un dépassement de durée doit rendre `timeout`");
  ensure(!countsAsAgentFailure(result), "un timeout ne compte pas comme un échec");
  ensure(isAgentOutput(result.output), "la sortie `timeout` doit rester non fiable");
};

const quotaIsItsOwnStatus: CaseBody = async (subject) => {
  await subject.trigger("quota", "usage limit");
  const result = await launch(subject);
  ensure(result.status === "quota", "un quota doit rendre `quota`, jamais `failed`");
  ensure(!countsAsAgentFailure(result), "un quota ne compte jamais comme un échec");
  ensure(isAgentOutput(result.output), "la sortie `quota` doit rester non fiable");
};

const failedHasTypedReason: CaseBody = async (subject) => {
  await subject.trigger("failed");
  const result = await launch(subject);
  ensure(result.status === "failed", "un échec de l'agent doit rendre `failed`");
  ensure(countsAsAgentFailure(result), "`failed` compte comme un échec");
  ensure(
    (AGENT_FAILURE_REASONS as readonly string[]).includes(result.reason),
    "la raison de l'échec doit appartenir à la liste fermée",
  );
};

const mapsUnavailableAndAuth: CaseBody = async (subject, factory) => {
  await subject.trigger("unavailable");
  const unavailable = await rejectionOf(launch(subject));
  ensure(unavailable instanceof AgentRuntimeUnavailableError, "indisponibilité : erreur typée");
  const other = await factory();
  await other.trigger("auth");
  const auth = await rejectionOf(launch(other));
  ensure(auth instanceof AgentAuthError, "authentification refusée : erreur typée");
};

const neverLeaks: CaseBody = async (subject, factory) => {
  const seen: unknown[] = [];
  for (const kind of ["failed", "timeout", "quota", "unavailable", "auth"] as const) {
    const current = kind === "failed" ? subject : await factory();
    await current.trigger(kind, `${OUTPUT_SENTINEL} ${current.validKey}`);
    const error = await rejectionOf(launch(current).then((result) => seen.push(result)));
    seen.push(error);
    const guard = await rejectionOf(launch(current, { worktree: `relatif/${current.validKey}` }));
    seen.push(guard);
  }
  const text = seen.map(renderings).join("\n");
  for (const secret of [subject.validKey, PROMPT_SENTINEL, OUTPUT_SENTINEL]) {
    ensure(
      !text.includes(secret),
      "une clé, un prompt ou une sortie fuit dans un résultat ou une erreur",
    );
  }
};

const isDeterministic: CaseBody = async (subject, factory) => {
  const second = await factory();
  await subject.replyWith("identique");
  await second.replyWith("identique");
  const [a, b] = [await launch(subject), await launch(second)];
  ensure(a.status === b.status, "deux requêtes identiques doivent donner le même statut");
  ensure(textOf(a) === textOf(b), "deux requêtes identiques doivent donner la même sortie");
};

const CASES: readonly (readonly [string, CaseBody])[] = [
  ["returns an untrusted output with usage", returnsUntrustedOutput],
  ["refuses a raw string prompt before any launch", refusesRawPrompt],
  ["refuses a relative worktree before any launch", refusesRelativeWorktree],
  ["refuses a missing or invalid budget before any launch", refusesInvalidBudget],
  ["refuses write tools for a read-only role", refusesWriteForReadOnlyRole],
  ["caps the output at maxOutputChars", capsOutput],
  ["returns aborted without launching when the signal is already aborted", abortedBeforeLaunch],
  ["returns aborted when the signal aborts during the session", abortedDuringSession],
  ["returns timeout as its own status", timeoutIsItsOwnStatus],
  ["returns quota as its own status, never failed", quotaIsItsOwnStatus],
  ["returns failed with a typed reason", failedHasTypedReason],
  ["maps unavailable and auth to typed errors", mapsUnavailableAndAuth],
  ["never leaks key, prompt or output in errors and results", neverLeaks],
  ["is deterministic for identical requests", isDeterministic],
];

export const CONFORMANCE_CASES: readonly AgentConformanceCase[] = CASES.map(([name, body]) => ({
  name,
  run: async (factory) => body(await factory(), factory),
}));
