import { describe, expect, it } from "vitest";
import {
  AGENT_TRACE_PATTERN,
  agentCredential,
  assertSessionRequest,
  InvalidAgentRequestError,
  type InvalidAgentRequestReason,
  toolsForRole,
} from "../src/index.ts";
import {
  BUDGET,
  countingRequest,
  makePrompt,
  makeRequest,
  reviewerRequest,
  SECRET_KEY,
  thrownBy,
  WORKTREE,
} from "./agent-helpers.ts";

const reasonOf = (request: unknown): unknown => {
  const error = thrownBy(() => assertSessionRequest(request as never));
  return error instanceof InvalidAgentRequestError ? error.reason : error;
};

describe("assertSessionRequest : requete valide", () => {
  it("retourne un instantane gele en profondeur, distinct de la requete", () => {
    const request = makeRequest();
    const snapshot = assertSessionRequest(request);
    expect(snapshot).not.toBe(request);
    expect(snapshot.role).toBe("developer");
    expect(snapshot.worktree).toBe(WORKTREE);
    for (const part of [snapshot, snapshot.budget, snapshot.trace, snapshot.tools]) {
      expect(Object.isFrozen(part)).toBe(true);
    }
    expect(Object.isFrozen(snapshot.tools.writablePaths)).toBe(true);
    expect(snapshot.prompt).toBe(request.prompt);
    expect(snapshot.signal).toBe(request.signal);
  });

  it("n'est pas affecte par une mutation de la requete apres la garde", () => {
    const request = makeRequest({ budget: { ...BUDGET }, trace: { ...makeRequest().trace } });
    const snapshot = assertSessionRequest(request);
    (request.budget as { timeoutMs: number }).timeoutMs = 1;
    (request.trace as { purpose: string }).purpose = "mute";
    (request as { worktree: string }).worktree = "/ailleurs";
    expect(snapshot.budget.timeoutMs).toBe(BUDGET.timeoutMs);
    expect(snapshot.trace.purpose).toBe("dev-session");
    expect(snapshot.worktree).toBe(WORKTREE);
  });

  it("lit chaque champ une seule fois (accesseurs)", () => {
    const { request, reads } = countingRequest(makeRequest());
    assertSessionRequest(request);
    expect(Object.keys(reads).length).toBeGreaterThan(8);
    for (const [path, count] of Object.entries(reads)) {
      expect(count, path).toBe(1);
    }
  });

  it("accepte l'absence de cle (abonnement) et garde la cle opaque", () => {
    const snapshot = assertSessionRequest(makeRequest({ credential: undefined }));
    expect(snapshot.credential).toBeUndefined();
    const withKey = assertSessionRequest(makeRequest());
    expect(JSON.stringify(withKey)).not.toContain(SECRET_KEY);
  });

  it("ne leve pas pour un signal deja annule (le runtime repond aborted)", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => assertSessionRequest(makeRequest({ signal: controller.signal }))).not.toThrow();
  });
});

describe("assertSessionRequest : refus avec raison fermee", () => {
  const cases: [InvalidAgentRequestReason, () => unknown][] = [
    ["request", () => undefined],
    ["request", () => null],
    ["request", () => "requete"],
    ["role", () => makeRequest({ role: "root" })],
    ["role", () => makeRequest({ role: undefined })],
    ["role", () => makeRequest({ role: "Developer" })],
    ["prompt", () => makeRequest({ prompt: "prompt en chaine brute" })],
    ["prompt", () => makeRequest({ prompt: { system: "s", user: "u" } })],
    ["prompt", () => makeRequest({ prompt: Object.create(makePrompt()) })],
    ["worktree", () => makeRequest({ worktree: "relatif/chemin" })],
    ["worktree", () => makeRequest({ worktree: "./tk-73" })],
    ["worktree", () => makeRequest({ worktree: "" })],
    ["worktree", () => makeRequest({ worktree: "/" })],
    ["worktree", () => makeRequest({ worktree: "/work/../etc" })],
    ["worktree", () => makeRequest({ worktree: "/work/a\0b" })],
    ["worktree", () => makeRequest({ worktree: "C:\\work\\tk" })],
    ["worktree", () => makeRequest({ worktree: 42 })],
    ["tools", () => makeRequest({ tools: undefined })],
    ["tools", () => makeRequest({ tools: "all" })],
    ["signal", () => makeRequest({ signal: undefined })],
    ["signal", () => makeRequest({ signal: { aborted: false } })],
    ["signal", () => makeRequest({ signal: "abort" })],
    ["trace", () => makeRequest({ trace: undefined })],
    ["trace", () => makeRequest({ trace: { purpose: "ok", correlationId: "a b" } })],
    ["trace", () => makeRequest({ trace: { purpose: "x".repeat(65), correlationId: "ok" } })],
    [
      "trace",
      () => makeRequest({ trace: { purpose: "contenu: un secret ?", correlationId: "ok" } }),
    ],
    ["credential", () => makeRequest({ credential: SECRET_KEY })],
    ["credential", () => makeRequest({ credential: { reveal: () => SECRET_KEY } })],
  ];
  it.each(cases)("%s (variante %#)", (reason, request) => {
    expect(reasonOf(request())).toBe(reason);
  });
});

describe("assertSessionRequest : politique d'outils et budget", () => {
  it("refuse un role en ecriture avec une politique de lecture seule superieure (reviewer + outils developer)", () => {
    expect(reasonOf(reviewerRequest({ tools: toolsForRole("developer") }))).toBe("tools");
  });

  it("refuse une option dangereuse ou un reseau/MCP dans la politique d'outils", () => {
    const dev = toolsForRole("developer");
    for (const extra of [
      { dangerouslySkipPermissions: true },
      { bypassPermissions: true },
      { network: "allowlist" },
      { mcp: true },
      { shell: "any" },
      { write: "yes" },
    ]) {
      expect(reasonOf(makeRequest({ tools: { ...dev, ...extra } })), JSON.stringify(extra)).toBe(
        "tools",
      );
    }
  });

  it("accepte une politique plus restreinte que celle du role", () => {
    const narrower = { ...toolsForRole("developer"), write: false, edit: false, writablePaths: [] };
    expect(() => assertSessionRequest(makeRequest({ tools: narrower }))).not.toThrow();
  });

  it("refuse un budget absent, avant toute autre verification de budget", () => {
    const error = thrownBy(() => assertSessionRequest(makeRequest({ budget: undefined })));
    expect(error).toMatchObject({ name: "InvalidAgentBudgetError", field: "budget" });
  });
});

describe("assertSessionRequest : ordre des controles", () => {
  it("verifie dans l'ordre role, prompt, worktree, outils, signal, trace, cle, budget", () => {
    const broken = makeRequest({
      role: "x",
      prompt: "x",
      worktree: "x",
      tools: "x",
      signal: "x",
      trace: "x",
      credential: "x",
      budget: "x",
    });
    const order: InvalidAgentRequestReason[] = [];
    const state: Record<string, unknown> = { ...broken };
    const fixes: [InvalidAgentRequestReason, Record<string, unknown>][] = [
      ["role", { role: "developer" }],
      ["prompt", { prompt: makePrompt() }],
      ["worktree", { worktree: WORKTREE }],
      ["tools", { tools: toolsForRole("developer") }],
      ["signal", { signal: new AbortController().signal }],
      ["trace", { trace: { purpose: "p", correlationId: "c" } }],
      ["credential", { credential: agentCredential(SECRET_KEY) }],
    ];
    for (const [expected, fix] of fixes) {
      const reason = reasonOf(state);
      expect(reason).toBe(expected);
      order.push(reason as InvalidAgentRequestReason);
      Object.assign(state, fix);
    }
    expect(order).toHaveLength(7);
  });

  it("n'embarque jamais le contenu fautif dans l'erreur", () => {
    const error = thrownBy(() =>
      assertSessionRequest(makeRequest({ worktree: `relatif/${SECRET_KEY}` })),
    ) as Error;
    expect(error).toBeInstanceOf(InvalidAgentRequestError);
    expect(`${error.message}${JSON.stringify(error)}${error.stack}`).not.toContain(SECRET_KEY);
  });
});

describe("motif de trace", () => {
  it("est le motif cadre de l'ADR 0011", () => {
    expect(AGENT_TRACE_PATTERN.source).toBe("^[A-Za-z0-9._:-]{1,64}$");
    expect(AGENT_TRACE_PATTERN.test("dev-session:tk-73.1")).toBe(true);
    expect(AGENT_TRACE_PATTERN.test("")).toBe(false);
  });
});
