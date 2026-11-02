import { describe, expect, it } from "vitest";
import { classifyClaudeFailure } from "../../src/claude-code/index.ts";
import { AgentAuthError, QUOTA_PATTERNS } from "../../src/index.ts";
import { makeRequest } from "../agent-helpers.ts";
import { makeRuntime, makeSandbox, type Scenario, script } from "./support.ts";

/** Une formulation par entree de la table de TK-74 (formulations UNVERIFIED sans capture reelle). */
const PHRASES: Readonly<Record<string, string>> = {
  "claude-usage-limit-reached-epoch": "Claude AI usage limit reached|1760000000",
  "five-hour-limit-resets-clock": "5-hour limit reached ∙ resets 3pm",
  "weekly-limit-reached": "Weekly limit reached ∙ resets Mon 9am",
  "opus-limit-reached": "Opus limit reached ∙ resets 9:30am",
  "your-limit-will-reset-at":
    "Claude usage limit reached. Your limit will reset at 3pm (Europe/Paris)",
  "hit-your-limit-resets": "You've hit your limit · resets 11pm (Europe/Paris)",
  "api-429-rate-limit-error":
    '{"type":"error","error":{"type":"rate_limit_error","message":"This request would exceed your rate limit."}}',
  "api-429-retry-after": "API Error: 429 rate_limit_error retry-after: 30",
  "api-429-too-many-requests": "API Error: 429 Too Many Requests",
  "credit-balance-too-low": "Credit balance is too low",
  "unknown-limit-heuristic": "Monthly limit reached ∙ resets Dec 1",
};
const phrase = (name: string): string => PHRASES[name] ?? "";
const AUTH = "Invalid API key · Please run /login";
const CHANNELS = ["stderr", "result"] as const;

const launch = async (scenario: Scenario) => {
  const sandbox = makeSandbox();
  script(sandbox, scenario);
  return makeRuntime(sandbox).launchSession(makeRequest({ worktree: sandbox.worktree }));
};

describe("la table de quotas de TK-74 pilote l'adaptateur", () => {
  it("couvre exactement les entrees de QUOTA_PATTERNS", () => {
    expect(Object.keys(PHRASES).sort()).toEqual(QUOTA_PATTERNS.map((p) => p.name).sort());
  });

  it.each(Object.entries(PHRASES))("classifie %s en quota", (_name, phrase) => {
    for (const resultIsError of [true, false]) {
      expect(classifyClaudeFailure(phrase, { exitCode: 1, resultIsError })).toBe("quota");
    }
  });

  it.each(
    Object.entries(PHRASES).flatMap(([name, phrase]) =>
      CHANNELS.map((channel) => [name, channel, phrase] as const),
    ),
  )("%s (canal %s) -> statut quota, jamais failed", async (_name, channel, phrase) => {
    const result = await launch({ scenario: "quota", text: phrase, channel });
    expect(result.status).toBe("quota");
  });
});

describe("delai de reprise du fournisseur", () => {
  it.each(CHANNELS)("retry-after devient retryAfterMs (canal %s)", async (channel) => {
    const result = await launch({
      scenario: "quota",
      text: phrase("api-429-retry-after"),
      channel,
    });
    expect(result).toMatchObject({ status: "quota", retryAfterMs: 30_000 });
  });

  it("une date de reprise absolue future devient un delai restant", async () => {
    const epoch = Math.floor(Date.now() / 1000) + 3600;
    const result = await launch({
      scenario: "quota",
      text: `Claude AI usage limit reached|${epoch}`,
    });
    if (result.status !== "quota") throw new Error(`statut ${result.status}`);
    expect(result.retryAfterMs).toBeGreaterThan(3_000_000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(3_600_000);
  });

  it("sans date fournie, ou date passee, aucun retryAfterMs", async () => {
    for (const text of [
      phrase("five-hour-limit-resets-clock"),
      phrase("claude-usage-limit-reached-epoch"),
    ]) {
      const result = await launch({ scenario: "quota", text });
      expect(result.status).toBe("quota");
      expect(result).not.toHaveProperty("retryAfterMs");
    }
  });

  it("ne porte aucun secret dans le resultat", async () => {
    const result = await launch({
      scenario: "quota",
      text: `${phrase("api-429-retry-after")} sk-ant-api03-LEAKEDSECRET0123456789`,
    });
    expect(JSON.stringify(result)).not.toContain("LEAKEDSECRET");
  });
});

describe("priorite : authentification > quota > autres causes", () => {
  it("une sortie citant l'authentification ET la limite est une authentification", async () => {
    expect(classifyClaudeFailure(`${phrase("weekly-limit-reached")}\n${AUTH}`, ctx())).toBe("auth");
    await expect(
      launch({ scenario: "quota", text: `${AUTH}\n${phrase("hit-your-limit-resets")}` }),
    ).rejects.toBeInstanceOf(AgentAuthError);
  });

  it("incident-22-quota-is-never-ambiguous-spec cote adaptateur", async () => {
    const noise = "The specification is ambiguous and I cannot decide.\n";
    for (const phrase of Object.values(PHRASES)) {
      expect(classifyClaudeFailure(`${noise}${phrase}`, ctx())).toBe("quota");
    }
    const result = await launch({
      scenario: "quota",
      text: `${noise}${phrase("weekly-limit-reached")}`,
    });
    expect(result.status).toBe("quota");
  });
});

function ctx(resultIsError = true) {
  return { exitCode: 1, resultIsError };
}

describe("faux positifs", () => {
  it.each([
    "error: exceeded line limit in lint rule",
    "the file size limit of the test is 5",
    "error at src/app.ts:429",
    "GET /login returned 500",
    "processed 4290 items",
    "see /login page source",
    "usage limit",
    "HTTP 429",
    "TypeError: boom",
  ])("n'est pas un quota : %s", (text) => {
    expect(classifyClaudeFailure(text, ctx())).toBe("agent_error");
    expect(classifyClaudeFailure(text, ctx(false))).toBe("process_error");
  });

  it("une erreur ordinaire reste `failed`", async () => {
    const result = await launch({
      scenario: "quota",
      text: "error: exceeded line limit in lint rule",
    });
    expect(result.status).toBe("failed");
  });

  it("un succes qui cite la phrase de quota reste `completed`", async () => {
    for (const phrase of Object.values(PHRASES)) {
      const result = await launch({ scenario: "completed", text: `Je gere: "${phrase}"` });
      expect(result.status).toBe("completed");
    }
  });
});

describe("sortie hostile", () => {
  const hostile = (tail: string): string =>
    `${"\u001b[31m\u202e\u2066x".repeat(40_000)}\n${"limit ".repeat(100_000)}\n${tail}`;

  it("reste borne en temps sur 1 Mo, avec ou sans quota", () => {
    const start = performance.now();
    expect(classifyClaudeFailure(hostile(phrase("weekly-limit-reached")), ctx())).toBe("quota");
    expect(classifyClaudeFailure(hostile("rien"), ctx())).toBe("agent_error");
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("bout en bout sur une grande sortie hostile", async () => {
    const result = await launch({
      scenario: "quota",
      text: hostile(phrase("hit-your-limit-resets")).slice(-200_000),
      channel: "stderr",
    });
    expect(result.status).toBe("quota");
  });
});
