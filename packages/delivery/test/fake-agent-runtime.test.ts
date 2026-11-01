import { Untrusted } from "@koklo/domain";
import { describe, expect, it } from "vitest";
import {
  AgentAuthError,
  AgentRuntimeUnavailableError,
  countsAsAgentFailure,
  InvalidAgentRequestError,
} from "../src/index.ts";
import { FakeAgentRuntime, FakeAgentScriptExhaustedError } from "../src/testing/index.ts";
import {
  BUDGET,
  makePrompt,
  makeRequest,
  OUTPUT_TEXT,
  reviewerRequest,
  SECRET_KEY,
  WORKTREE,
} from "./agent-helpers.ts";

const rejection = async (call: Promise<unknown>): Promise<unknown> => {
  try {
    await call;
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("FakeAgentRuntime : reponses scriptees", () => {
  it("s'identifie 'fake' et rend une sortie non fiable avec usage", async () => {
    const fake = FakeAgentRuntime.replying(OUTPUT_TEXT);
    expect(fake.id).toBe("fake");
    const result = await fake.launchSession(makeRequest());
    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.output).toBeInstanceOf(Untrusted);
    expect(result.output.origin).toBe("model-output");
    expect(`${result.output}`).not.toContain(OUTPUT_TEXT);
    expect(result.usage.costMicroUsd).toBe(0);
    expect(result.usage.durationMs).toBe(0);
  });

  it("consomme les etapes dans l'ordre puis s'epuise", async () => {
    const fake = new FakeAgentRuntime().script([
      { status: "completed", output: "un" },
      { status: "failed", reason: "tool_denied", output: "deux" },
      { status: "timeout", output: "partielle" },
      { status: "quota", output: "limite", retryAfterMs: 5_000 },
      { status: "aborted" },
    ]);
    const statuses: string[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await fake.launchSession(makeRequest())).status);
    }
    expect(statuses).toEqual(["completed", "failed", "timeout", "quota", "aborted"]);
    const error = await rejection(fake.launchSession(makeRequest()));
    expect(error).toBeInstanceOf(FakeAgentScriptExhaustedError);
  });

  it("le quota garde retryAfterMs et n'est pas un echec", async () => {
    const fake = new FakeAgentRuntime().script([
      { status: "quota", output: "usage limit", retryAfterMs: 5_000 },
    ]);
    const result = await fake.launchSession(makeRequest());
    expect(result).toMatchObject({ status: "quota", retryAfterMs: 5_000 });
    expect(countsAsAgentFailure(result)).toBe(false);
  });

  it("l'echec a une raison par defaut agent_error", async () => {
    const result = await new FakeAgentRuntime()
      .script([{ status: "failed" }])
      .launchSession(makeRequest());
    expect(result).toMatchObject({ status: "failed", reason: "agent_error" });
    expect(result.output).toBeInstanceOf(Untrusted);
  });
});

describe("FakeAgentRuntime : erreurs et determinisme", () => {
  it("une etape {fail} leve l'erreur typee fournie", async () => {
    const unavailable = new AgentRuntimeUnavailableError({ operation: "launch", runtime: "fake" });
    expect(
      await rejection(FakeAgentRuntime.failing(unavailable).launchSession(makeRequest())),
    ).toBe(unavailable);
    const auth = new AgentAuthError({ operation: "launch", runtime: "fake" });
    const fake = new FakeAgentRuntime().script([{ fail: auth }]);
    expect(await rejection(fake.launchSession(makeRequest()))).toBe(auth);
  });

  it("est deterministe : meme script, meme resultat", async () => {
    const run = async () =>
      new FakeAgentRuntime()
        .script([{ status: "completed", output: "x", costMicroUsd: 7, elapsedMs: 9 }])
        .launchSession(makeRequest());
    const [a, b] = await Promise.all([run(), run()]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: "completed", usage: { costMicroUsd: 7, durationMs: 9 } });
  });
});

describe("FakeAgentRuntime : budget", () => {
  it("tronque la sortie a maxOutputChars", async () => {
    const budget = { ...BUDGET, maxOutputChars: 5 };
    const fake = FakeAgentRuntime.replying("0123456789");
    const result = await fake.launchSession(makeRequest({ budget }));
    expect(result.status).toBe("completed");
  });

  it("passe en timeout quand la duree depasse timeoutMs, avec sortie partielle", async () => {
    const fake = new FakeAgentRuntime().script([
      { status: "completed", output: "long", elapsedMs: BUDGET.timeoutMs + 1 },
    ]);
    expect((await fake.launchSession(makeRequest())).status).toBe("timeout");
  });

  it("echoue en budget_exceeded quand le cout depasse maxCostMicroUsd", async () => {
    const fake = new FakeAgentRuntime().script([
      { status: "completed", output: "cher", costMicroUsd: BUDGET.maxCostMicroUsd + 1 },
    ]);
    expect(await fake.launchSession(makeRequest())).toMatchObject({
      status: "failed",
      reason: "budget_exceeded",
    });
  });
});

describe("FakeAgentRuntime : annulation", () => {
  it("un signal deja annule rend aborted sans lancer ni consommer le script", async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = FakeAgentRuntime.replying("jamais");
    const result = await fake.launchSession(makeRequest({ signal: controller.signal }));
    expect(result.status).toBe("aborted");
    expect(fake.calls).toHaveLength(0);
  });

  it("hang rend aborted quand le signal est annule en cours de session", async () => {
    const controller = new AbortController();
    const fake = new FakeAgentRuntime().script([{ status: "hang" }]);
    const pending = fake.launchSession(makeRequest({ signal: controller.signal }));
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    controller.abort();
    expect((await pending).status).toBe("aborted");
  });

  it("refuse une requete invalide avant tout lancement", async () => {
    const fake = FakeAgentRuntime.replying("x");
    for (const bad of [
      makeRequest({ prompt: "brut" }),
      makeRequest({ worktree: "relatif" }),
      makeRequest({ budget: undefined }),
      reviewerRequest({ tools: makeRequest().tools }),
    ]) {
      expect(await rejection(fake.launchSession(bad))).toBeInstanceOf(Error);
    }
    expect(fake.calls).toHaveLength(0);
    const error = await rejection(fake.launchSession(makeRequest({ role: "root" })));
    expect(error).toBeInstanceOf(InvalidAgentRequestError);
  });
});

describe("FakeAgentRuntime : enregistrement", () => {
  it("enregistre les appels sans la cle", async () => {
    const fake = FakeAgentRuntime.replying("ok");
    const prompt = makePrompt();
    await fake.launchSession(makeRequest({ prompt }));
    await fake.launchSession(makeRequest({ credential: undefined }));
    const [first, second] = fake.calls;
    expect(fake.calls).toHaveLength(2);
    expect(first).toMatchObject({
      role: "developer",
      worktree: WORKTREE,
      credentialProvided: true,
      trace: { purpose: "dev-session", correlationId: "run-0001" },
    });
    expect(first?.prompt).toBe(prompt);
    expect(second?.credentialProvided).toBe(false);
    expect("credential" in (first as object)).toBe(false);
    expect(JSON.stringify(fake.calls)).not.toContain(SECRET_KEY);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("calls est une copie : la muter ne change pas l'enregistrement", async () => {
    const fake = FakeAgentRuntime.replying("ok");
    await fake.launchSession(makeRequest());
    (fake.calls as unknown[]).length = 0;
    expect(fake.calls).toHaveLength(1);
  });
});
