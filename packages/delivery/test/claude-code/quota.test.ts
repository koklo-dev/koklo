import { describe, expect, it } from "vitest";
import { classifyClaudeFailure } from "../../src/claude-code/index.ts";
import { makeRequest } from "../agent-helpers.ts";
import { makeRuntime, makeSandbox, script } from "./support.ts";

/** Formulations minimales (TK-73) ; la table exhaustive « une formulation reelle par test » est TK-74. */
const QUOTA_PHRASES = [
  "Claude AI usage limit reached|1760000000",
  "Claude usage limit reached. Your limit will reset at 3pm",
  "5-hour limit reached ∙ resets 3pm",
  "Weekly limit reached ∙ resets Mon 9am",
  "You've hit your limit · resets 11pm (Europe/Paris)",
  '{"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your rate limit."}}',
  "API Error: 429 Too Many Requests",
  "usage limit",
];

describe("classifyClaudeFailure : formulations de quota", () => {
  it.each(QUOTA_PHRASES)("reconnait le quota : %s", (phrase) => {
    expect(classifyClaudeFailure(phrase, { exitCode: 1, resultIsError: false })).toBe("quota");
    expect(classifyClaudeFailure(phrase, { exitCode: 1, resultIsError: true })).toBe("quota");
  });

  it("ne confond pas une erreur ordinaire contenant « limit » avec un quota", () => {
    for (const text of [
      "error: exceeded line limit in lint rule",
      "TypeError: boom",
      "the file size limit of the test is 5",
    ]) {
      expect(classifyClaudeFailure(text, { exitCode: 1, resultIsError: true })).toBe("agent_error");
      expect(classifyClaudeFailure(text, { exitCode: 1, resultIsError: false })).toBe(
        "process_error",
      );
    }
  });

  it.each([
    "error at src/app.ts:429",
    "GET /login returned 500",
    "processed 4290 items",
    "see /login page source",
  ])("n'est ni un quota ni une authentification sans contexte : %s", (text) => {
    expect(classifyClaudeFailure(text, { exitCode: 1, resultIsError: true })).toBe("agent_error");
  });

  it.each(["HTTP 429", "status: 429", "status code 429", "error code 429", "API Error: 429"])(
    "reconnait le quota avec contexte : %s",
    (text) => {
      expect(classifyClaudeFailure(text, { exitCode: 1, resultIsError: true })).toBe("quota");
    },
  );

  it("distingue l'authentification du quota", () => {
    expect(
      classifyClaudeFailure("Invalid API key · Please run /login", {
        exitCode: 1,
        resultIsError: true,
      }),
    ).toBe("auth");
  });
});

describe("quota de bout en bout : jamais `failed`", () => {
  const channels = ["stderr", "result"] as const;
  const cases = QUOTA_PHRASES.flatMap((phrase) =>
    channels.map((channel) => [phrase, channel] as const),
  );

  it.each(cases)("%s (canal %s) -> statut quota", async (phrase, channel) => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "quota", text: phrase, channel });
    const result = await makeRuntime(sandbox).launchSession(
      makeRequest({ worktree: sandbox.worktree }),
    );
    expect(result.status).toBe("quota");
  });

  it("une erreur ordinaire reste `failed`, pas `quota`", async () => {
    const sandbox = makeSandbox();
    script(sandbox, { scenario: "quota", text: "error: exceeded line limit in lint rule" });
    const result = await makeRuntime(sandbox).launchSession(
      makeRequest({ worktree: sandbox.worktree }),
    );
    expect(result.status).toBe("failed");
  });
});
