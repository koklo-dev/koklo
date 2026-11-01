import { revealUntrusted } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  AgentAuthError,
  type AgentRuntime,
  AgentRuntimeError,
  AgentRuntimeUnavailableError,
  type AgentSessionRequest,
  type AgentSessionResult,
  agentOutput,
  assertSessionRequest,
  revealAgentCredential,
} from "../src/index.ts";
import {
  AGENT_CONFORMANCE_CASE_NAMES,
  AGENT_FAILURE_TRIGGERS,
  type AgentConformanceFactory,
  AgentConformanceFailure,
  type AgentConformanceSubject,
  agentRuntimeConformanceCases,
  FakeAgentRuntime,
  runAgentRuntimeConformance,
} from "../src/testing/index.ts";
import { SECRET_KEY } from "./agent-helpers.ts";

/** Sujet adosse a FakeAgentRuntime : le faux est le premier client de la suite. */
const fakeSubject = (): AgentConformanceSubject => {
  const fake = new FakeAgentRuntime();
  return {
    runtime: fake,
    validKey: SECRET_KEY,
    replyWith: (output) => void fake.script([{ status: "completed", output }]),
    trigger: (kind, output = "sortie brute") => {
      const error = { operation: "launch", runtime: "fake" } as const;
      const steps = {
        failed: { status: "failed", reason: "agent_error", output },
        timeout: { status: "timeout", output },
        quota: { status: "quota", output, retryAfterMs: 60_000 },
        unavailable: { fail: new AgentRuntimeUnavailableError(error) },
        auth: { fail: new AgentAuthError(error) },
      } as const;
      fake.script([steps[kind]]);
    },
    hangUntilAborted: () => void fake.script([{ status: "hang" }]),
    launchesMade: () => fake.calls.length,
  };
};

runAgentRuntimeConformance("FakeAgentRuntime", () => fakeSubject(), { describe, it });

describe("suite de conformite : forme", () => {
  it("expose une liste fermee de cas et de declencheurs, sans doublon", () => {
    expect(new Set(AGENT_CONFORMANCE_CASE_NAMES).size).toBe(AGENT_CONFORMANCE_CASE_NAMES.length);
    expect([...AGENT_CONFORMANCE_CASE_NAMES]).toEqual([
      "returns an untrusted output with usage",
      "refuses a raw string prompt before any launch",
      "refuses a relative worktree before any launch",
      "refuses a missing or invalid budget before any launch",
      "refuses write tools for a read-only role",
      "caps the output at maxOutputChars",
      "returns aborted without launching when the signal is already aborted",
      "returns aborted when the signal aborts during the session",
      "returns timeout as its own status",
      "returns quota as its own status, never failed",
      "returns failed with a typed reason",
      "maps unavailable and auth to typed errors",
      "never leaks key, prompt or output in errors and results",
      "is deterministic for identical requests",
    ]);
    expect(agentRuntimeConformanceCases().map((c) => c.name)).toEqual([
      ...AGENT_CONFORMANCE_CASE_NAMES,
    ]);
    expect([...AGENT_FAILURE_TRIGGERS].sort()).toEqual(
      ["auth", "failed", "quota", "timeout", "unavailable"].sort(),
    );
  });

  it("delegue au moteur injecte : un describe, un it par cas", () => {
    const seen: string[] = [];
    let described = "";
    runAgentRuntimeConformance("Sujet", () => fakeSubject(), {
      describe: (name, body) => {
        described = name;
        body();
      },
      it: (name) => void seen.push(name),
    });
    expect(described).toBe("Sujet");
    expect(seen).toEqual([...AGENT_CONFORMANCE_CASE_NAMES]);
  });
});

const failureOf = async (name: string, factory: AgentConformanceFactory): Promise<unknown> => {
  const testCase = agentRuntimeConformanceCases().find((c) => c.name === name);
  if (testCase === undefined) throw new Error(`cas inconnu : ${name}`);
  return testCase.run(factory).then(
    () => undefined,
    (error: unknown) => error,
  );
};

describe("suite de conformite : bon sujet", () => {
  it("passe chaque cas sur un bon sujet", async () => {
    expect(AGENT_CONFORMANCE_CASE_NAMES.length).toBeGreaterThan(0);
    for (const name of AGENT_CONFORMANCE_CASE_NAMES) {
      expect(await failureOf(name, () => fakeSubject()), name).toBeUndefined();
    }
  });
});

/** Sujet defectueux : derive du bon sujet en enveloppant le runtime. */
const broken =
  (
    wrap: (inner: AgentRuntime, subject: AgentConformanceSubject) => AgentRuntime,
  ): AgentConformanceFactory =>
  () => {
    const subject = fakeSubject();
    return { ...subject, runtime: wrap(subject.runtime, subject) };
  };

const mapResult =
  (change: (result: AgentSessionResult) => AgentSessionResult) =>
  (inner: AgentRuntime): AgentRuntime => ({
    id: inner.id,
    launchSession: async (request) => change(await inner.launchSession(request)),
  });

/** Contourne la garde : le sujet lance meme une requete invalide (ne passe pas par assertSessionRequest). */
const unguarded = (inner: AgentRuntime): AgentRuntime => ({
  id: inner.id,
  launchSession: async (_request: AgentSessionRequest) => ({
    status: "completed",
    output: agentOutput("lance quand meme"),
    usage: { costMicroUsd: 0, durationMs: 0 },
  }),
});

const DEFECTS: [string, string, AgentConformanceFactory][] = [
  [
    "accepte un prompt en chaine brute",
    "refuses a raw string prompt before any launch",
    broken((inner) => ({
      id: inner.id,
      launchSession: (request) =>
        typeof request.prompt === "string"
          ? unguarded(inner).launchSession(request)
          : inner.launchSession(request),
    })),
  ],
  [
    "n'applique pas le budget",
    "refuses a missing or invalid budget before any launch",
    broken(unguarded),
  ],
  [
    "sort un quota en echec",
    "returns quota as its own status, never failed",
    broken(
      mapResult((r) =>
        r.status === "quota" ? { status: "failed", reason: "agent_error", output: r.output } : r,
      ),
    ),
  ],
  [
    "sort un timeout en echec",
    "returns timeout as its own status",
    broken(
      mapResult((r) =>
        r.status === "timeout"
          ? { status: "failed", reason: "process_error", output: r.output }
          : r,
      ),
    ),
  ],
  [
    "ne tronque pas la sortie",
    "caps the output at maxOutputChars",
    broken((inner) => ({
      id: inner.id,
      launchSession: async (request) => {
        const result = await inner.launchSession(request);
        return result.status === "completed"
          ? { ...result, output: agentOutput("x".repeat(request.budget.maxOutputChars + 1)) }
          : result;
      },
    })),
  ],
  [
    "rend une sortie en chaine brute",
    "returns an untrusted output with usage",
    broken(mapResult((r) => ({ ...r, output: "brut" }) as unknown as AgentSessionResult)),
  ],
  [
    "lance malgre un signal deja annule",
    "returns aborted without launching when the signal is already aborted",
    broken((inner) => ({
      id: inner.id,
      launchSession: (request) =>
        inner.launchSession({ ...request, signal: new AbortController().signal }),
    })),
  ],
  [
    "leve une Error brute au lieu d'une erreur typee",
    "maps unavailable and auth to typed errors",
    broken((inner) => ({
      id: inner.id,
      launchSession: async (request) => {
        try {
          return await inner.launchSession(request);
        } catch {
          throw new Error("boom");
        }
      },
    })),
  ],
  [
    "divulgue la cle dans l'erreur",
    "never leaks key, prompt or output in errors and results",
    broken((inner) => ({
      id: inner.id,
      launchSession: async (request) => {
        try {
          return await inner.launchSession(request);
        } catch (error) {
          const leak =
            request.credential === undefined ? "" : revealAgentCredential(request.credential);
          throw new AgentRuntimeError({ operation: "launch" }, `echec ${leak} ${String(error)}`);
        }
      },
    })),
  ],
  [
    "divulgue la sortie brute dans le resultat",
    "never leaks key, prompt or output in errors and results",
    broken(
      mapResult(
        (r) => ({ ...r, rawOutput: revealUntrusted(r.output) }) as unknown as AgentSessionResult,
      ),
    ),
  ],
  [
    "accepte un worktree relatif",
    "refuses a relative worktree before any launch",
    broken((inner) => ({
      id: inner.id,
      launchSession: (request) =>
        request.worktree.startsWith("/")
          ? inner.launchSession(request)
          : unguarded(inner).launchSession(request),
    })),
  ],
  [
    "donne l'ecriture a un role en lecture seule",
    "refuses write tools for a read-only role",
    broken((inner) => ({
      id: inner.id,
      launchSession: (request) =>
        request.role === "qa-reviewer" && request.tools.write
          ? unguarded(inner).launchSession(request)
          : inner.launchSession(request),
    })),
  ],
  [
    "ignore le signal annule en cours de session",
    "returns aborted when the signal aborts during the session",
    broken(
      mapResult((r) =>
        r.status === "aborted"
          ? { status: "completed", output: r.output, usage: { costMicroUsd: 0, durationMs: 0 } }
          : r,
      ),
    ),
  ],
];

describe("suite de conformite : sujets defectueux detectes", () => {
  it.each(DEFECTS)("detecte un runtime qui %s", async (_label, caseName, factory) => {
    expect(AGENT_CONFORMANCE_CASE_NAMES).toContain(caseName);
    const error = await failureOf(caseName, factory);
    expect(error).toBeInstanceOf(AgentConformanceFailure);
  });

  it("les noms de cas attendus existent tous", () => {
    for (const [, caseName] of DEFECTS) {
      expect(AGENT_CONFORMANCE_CASE_NAMES).toContain(caseName);
    }
    expect(assertSessionRequest).toBeTypeOf("function");
  });
});
