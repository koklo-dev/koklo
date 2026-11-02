import { describe, expect, it } from "vitest";
import { makeRequest } from "../agent-helpers.ts";
import { makeRuntime, makeSandbox, type Scenario, script } from "./support.ts";

/** Revue d'attaque TK-74 (R2) : un quota n'est jamais compté comme échec, quel que soit le canal. */
const NET = [
  "Usage limit reached",
  "Claude usage limit reached",
  "Rate limit exceeded",
  "API Error: Rate limit reached",
  "You're out of extra usage · resets 3pm",
  "Request rejected (429)",
  "You have exceeded your usage limit",
  "5‑hour limit reached ∙ resets 3pm",
  "- Weekly limit reached ∙ resets Mon 9am",
] as const;
const CHANNELS = ["stderr", "result"] as const;

const launch = async (scenario: Scenario) => {
  const sandbox = makeSandbox();
  script(sandbox, scenario);
  return makeRuntime(sandbox).launchSession(makeRequest({ worktree: sandbox.worktree }));
};

describe("filet de sécurité des quotas côté adaptateur", () => {
  it.each(NET.flatMap((text) => CHANNELS.map((channel) => [text, channel] as const)))(
    "%j (canal %s) -> quota, jamais failed",
    async (text, channel) => {
      const result = await launch({ scenario: "quota", text, channel });
      expect(result.status).toBe("quota");
    },
  );

  it.each(NET)("%j dans un succès reste completed", async (text) => {
    const result = await launch({ scenario: "completed", text });
    expect(result.status).toBe("completed");
  });

  it("un faux positif cité reste failed", async () => {
    for (const text of ['  expect(x).toBe("weekly limit reached")', "> weekly limit reached"]) {
      const result = await launch({ scenario: "quota", text });
      expect(result.status, text).toBe("failed");
    }
  });

  it("le retry-after renvoyé est plafonné à 24 h", async () => {
    const result = await launch({
      scenario: "quota",
      text: "API Error: 429 rate_limit_error retry-after: 999999999",
    });
    if (result.status !== "quota") throw new Error(`statut ${result.status}`);
    expect(result.retryAfterMs).toBe(86_400_000);
  });
});
