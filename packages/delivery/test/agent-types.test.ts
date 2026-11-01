import { inspect } from "node:util";
import { Untrusted } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  AGENT_CREDENTIAL_MAX_LENGTH,
  AGENT_FAILURE_REASONS,
  AGENT_RESULT_STATUSES,
  AGENT_RUNTIME_IDS,
  AgentAuthError,
  AgentRuntimeError,
  AgentRuntimeUnavailableError,
  agentCredential,
  agentOutput,
  countsAsAgentFailure,
  INVALID_AGENT_CREDENTIAL_REASONS,
  INVALID_AGENT_REQUEST_REASONS,
  InvalidAgentCredentialError,
  InvalidAgentRequestError,
  isAgentCredential,
  isAgentOutput,
  revealAgentCredential,
} from "../src/index.ts";
import { OUTPUT_TEXT, SECRET_KEY, thrownBy } from "./agent-helpers.ts";

const outputOf = () => agentOutput(OUTPUT_TEXT);

describe("listes fermees", () => {
  it("sont figees", () => {
    expect([...AGENT_RUNTIME_IDS]).toEqual(["claude-code", "fake"]);
    expect([...AGENT_RESULT_STATUSES]).toEqual([
      "completed",
      "failed",
      "timeout",
      "aborted",
      "quota",
    ]);
    expect([...AGENT_FAILURE_REASONS]).toEqual([
      "agent_error",
      "tool_denied",
      "invalid_output",
      "process_error",
      "budget_exceeded",
    ]);
    expect([...INVALID_AGENT_REQUEST_REASONS]).toEqual([
      "request",
      "role",
      "prompt",
      "worktree",
      "tools",
      "budget",
      "signal",
      "trace",
      "credential",
    ]);
  });
});

describe("resultat : quota et timeout ne sont jamais des echecs", () => {
  it("seul failed compte comme echec", () => {
    const out = outputOf();
    const usage = { costMicroUsd: 1, durationMs: 1 };
    expect(countsAsAgentFailure({ status: "failed", reason: "agent_error", output: out })).toBe(
      true,
    );
    expect(countsAsAgentFailure({ status: "completed", output: out, usage })).toBe(false);
    expect(countsAsAgentFailure({ status: "timeout", output: out })).toBe(false);
    expect(countsAsAgentFailure({ status: "aborted", output: out })).toBe(false);
    expect(countsAsAgentFailure({ status: "quota", output: out, retryAfterMs: 1_000 })).toBe(false);
  });
});

describe("sortie d'agent", () => {
  it("est Untrusted('model-output') et masquee a l'interpolation", () => {
    const out = outputOf();
    expect(out).toBeInstanceOf(Untrusted);
    expect(out.origin).toBe("model-output");
    expect(isAgentOutput(out)).toBe(true);
    for (const rendered of [`${out}`, String(out), JSON.stringify({ out }), inspect(out)]) {
      expect(rendered).toContain("[untrusted:model-output]");
      expect(rendered).not.toContain(OUTPUT_TEXT);
    }
  });

  it("refuse une chaine brute ou une autre origine", () => {
    expect(isAgentOutput(OUTPUT_TEXT)).toBe(false);
    expect(isAgentOutput(new Untrusted("issue", OUTPUT_TEXT))).toBe(false);
    expect(isAgentOutput(null)).toBe(false);
  });
});

describe("cle d'agent opaque", () => {
  const makeKey = () => agentCredential(SECRET_KEY);

  it("n'est lisible que par revealAgentCredential", () => {
    const key = makeKey();
    expect(isAgentCredential(key)).toBe(true);
    expect(revealAgentCredential(key)).toBe(SECRET_KEY);
    for (const rendered of [
      `${key}`,
      String(key),
      JSON.stringify({ key }),
      inspect(key),
      JSON.stringify(Object.getOwnPropertyNames(key)),
    ]) {
      expect(rendered).not.toContain(SECRET_KEY);
    }
    expect(`${key}`).toBe("[redacted]");
    expect(Object.isFrozen(key)).toBe(true);
  });

  it("ne se forge pas", () => {
    expect(isAgentCredential(SECRET_KEY)).toBe(false);
    expect(isAgentCredential({ reveal: () => SECRET_KEY })).toBe(false);
    expect(isAgentCredential(null)).toBe(false);
  });

  it("refuse une cle invalide sans reprendre sa valeur", () => {
    expect([...INVALID_AGENT_CREDENTIAL_REASONS]).toEqual([
      "not-a-string",
      "empty",
      "too-long",
      "control-characters",
    ]);
    const cases: [unknown, string][] = [
      [42, "not-a-string"],
      ["   ", "empty"],
      ["a".repeat(AGENT_CREDENTIAL_MAX_LENGTH + 1), "too-long"],
      [`sk-${SECRET_KEY}\n`, "control-characters"],
    ];
    expect(AGENT_CREDENTIAL_MAX_LENGTH).toBe(512);
    for (const [value, reason] of cases) {
      const error = thrownBy(() => agentCredential(value as string));
      expect(error).toBeInstanceOf(InvalidAgentCredentialError);
      expect((error as InvalidAgentCredentialError).reason).toBe(reason);
      expect(JSON.stringify(error) + (error as Error).message).not.toContain(SECRET_KEY);
    }
  });
});

describe("erreurs typees du port", () => {
  it("la racine ne garde que des champs connus et valides", () => {
    const error = new AgentRuntimeError({
      operation: "launch",
      runtime: "fake",
      prompt: "PROMPT-SENTINELLE",
      key: SECRET_KEY,
      cause: new Error(SECRET_KEY),
    } as never);
    expect(error).toMatchObject({
      name: "AgentRuntimeError",
      operation: "launch",
      runtime: "fake",
    });
    expect(error.cause).toBeUndefined();
    expect(Object.keys(error).sort()).toEqual(["operation", "runtime"]);
    expect(error.message + JSON.stringify(error) + error.stack).not.toContain("SENTINELLE");
  });

  it("ramene une operation ou un runtime invalide a une valeur sure", () => {
    const error = new AgentRuntimeError({
      operation: `Bad Op ${SECRET_KEY}`,
      runtime: "x",
    } as never);
    expect(error.operation).toBe("unknown");
    expect(error.runtime).toBeUndefined();
  });

  it.each([
    ["AgentRuntimeUnavailableError", AgentRuntimeUnavailableError],
    ["AgentAuthError", AgentAuthError],
  ] as const)("%s descend de AgentRuntimeError et est nomme", (name, Type) => {
    const error = new Type({ operation: "launch", runtime: "claude-code" });
    expect(error).toBeInstanceOf(AgentRuntimeError);
    expect(error.name).toBe(name);
    expect(error.runtime).toBe("claude-code");
  });

  it("InvalidAgentRequestError reprend seulement la raison fermee", () => {
    const error = new InvalidAgentRequestError("worktree");
    expect(error).toBeInstanceOf(AgentRuntimeError);
    expect(error.reason).toBe("worktree");
    expect(error.message).toContain("worktree");
  });
});
