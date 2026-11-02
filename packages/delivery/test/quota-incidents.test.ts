import { describe, expect, it } from "vitest";
import {
  applyEvent,
  assertNoQuotaBlock,
  BLOCK_CAUSES,
  canStart,
  classifyAgentFailure,
  detectQuota,
  InvalidQuotaError,
  nextAllowedAt,
  onQuotaHit,
  quotaDecision,
  quotaHitEvent,
  type Run,
  startQuotaState,
} from "../src/index.ts";
import { event, LIMITS, REFERENCE, runAt, STATES } from "./helpers.ts";
import { BACKOFF, HOUR, MINUTE, NOW, OTHER_SCOPES, SCOPE, signal } from "./quota-helpers.ts";

const QUOTA_OUTPUTS = [
  "Claude AI usage limit reached|1760000000",
  "5-hour limit reached ∙ resets 3pm",
  "Weekly limit reached ∙ resets Mon 9am",
  "You've hit your limit · resets 11pm (Europe/Paris)",
  "Claude usage limit reached. Your limit will reset at 3pm (Europe/Paris)",
  "API Error: 429 Too Many Requests",
  "Credit balance is too low",
];

describe("incident 22 : un quota n'est jamais un défaut de ticket", () => {
  it("incident-22-quota-is-never-ambiguous-spec", () => {
    const noise = "The specification is ambiguous and I cannot decide. DECISION: ???\n";
    for (const phrase of QUOTA_OUTPUTS) {
      for (const output of [phrase, `${noise}${phrase}`, `${noise}${phrase}\n`]) {
        const failure = classifyAgentFailure(output);
        expect(failure.kind, output).toBe("quota");
        expect(failure).not.toHaveProperty("cause");
      }
    }
    expect(classifyAgentFailure("The specification is ambiguous.")).toEqual({ kind: "other" });
    expect(classifyAgentFailure("")).toEqual({ kind: "other" });
  });

  it("incident-22-quota-never-counts-as-attempt", () => {
    const active = STATES.filter((state) => REFERENCE[state].quota_hit !== undefined);
    expect(active.length).toBeGreaterThan(0);
    for (const state of active) {
      let run: Run = runAt(state, { attempts: 2, reviewRounds: 3, ciWaits: 1, version: 7 });
      let quota = startQuotaState();
      for (let hit = 0; hit < 6; hit++) {
        const found = detectQuota("5-hour limit reached ∙ resets 3pm");
        if (found === null) throw new Error("quota non détecté");
        quota = onQuotaHit(quota, { ...found, id: `s${hit}` }, NOW + hit * 2 * HOUR, 0, BACKOFF);
        run = applyEvent(run, quotaHitEvent(found), LIMITS).run;
        expect(run).toMatchObject({
          state,
          attempts: 2,
          reviewRounds: 3,
          ciWaits: 1,
          version: 7,
          blocked: null,
        });
      }
    }
  });

  it("quotaHitEvent est l'événement neutre quota_hit, jamais un block ni une escalade", () => {
    expect(quotaHitEvent(signal())).toEqual({ type: "quota_hit" });
    expect(quotaHitEvent(signal({ kind: "exhausted" }))).toEqual({ type: "quota_hit" });
  });

  it("D2 : la cause quota reste, mais la garde runner refuse un block quota", () => {
    expect(BLOCK_CAUSES).toContain("quota");
    expect(() => assertNoQuotaBlock({ type: "block", cause: "quota", output: "limit" })).toThrow(
      InvalidQuotaError,
    );
    expect(() => assertNoQuotaBlock(event("block"))).not.toThrow();
    expect(() => assertNoQuotaBlock({ type: "quota_hit" })).not.toThrow();
  });

  it("quotaDecision ne mène jamais à un blocage de ticket (start | wait | halt)", () => {
    let state = startQuotaState();
    for (const kind of ["rate_window", "exhausted", "unknown_limit"] as const) {
      state = onQuotaHit(state, signal({ kind, id: kind }), NOW, 0, BACKOFF);
      const decision = quotaDecision(state, NOW, SCOPE);
      expect(["start", "wait", "halt"]).toContain(decision.action);
      expect(decision).not.toHaveProperty("cause");
    }
  });
});

describe("incident 26 : un quota est découvert une fois, pour tous les workers", () => {
  it("incident-26-one-hit-backs-off-all-workers", () => {
    const start = startQuotaState();
    for (const scope of [SCOPE, ...OTHER_SCOPES]) expect(canStart(start, NOW, scope)).toBe(true);

    const hit = onQuotaHit(start, signal({ id: "worker-1:1" }), NOW, 0, BACKOFF);
    expect(hit.status).toBe("backoff");
    expect(hit.consecutiveHits).toBe(1);
    const resumeAt = hit.resumeAt as number;
    expect(resumeAt).toBeGreaterThan(NOW);

    for (const scope of [SCOPE, ...OTHER_SCOPES]) {
      expect(canStart(hit, NOW + 1, scope), JSON.stringify(scope)).toBe(false);
      expect(canStart(hit, resumeAt - 1, scope)).toBe(false);
      expect(nextAllowedAt(hit, NOW + 1, scope)).toBe(resumeAt);
      expect(quotaDecision(hit, NOW + 1, scope)).toEqual({ action: "wait", until: resumeAt });
      expect(canStart(hit, resumeAt, scope)).toBe(true);
      expect(quotaDecision(hit, resumeAt, scope)).toEqual({ action: "start" });
    }
  });
});

describe("incident 26 : une rafale compte une fois", () => {
  it("incident-26-burst-counts-once", () => {
    let state = startQuotaState();
    for (let worker = 0; worker < 12; worker++) {
      state = onQuotaHit(
        state,
        signal({ id: `worker-${worker}:1` }),
        NOW + worker * 500,
        0,
        BACKOFF,
      );
    }
    expect(state.consecutiveHits).toBe(1);
    expect(state.status).toBe("backoff");
    // un seul palier : base (2^0), pas 2^12
    expect(state.resumeAt).toBeLessThanOrEqual(NOW + 12 * 500 + 2 * BACKOFF.baseMs);

    const after = onQuotaHit(state, signal({ id: "retry" }), state.resumeAt as number, 0, BACKOFF);
    expect(after.consecutiveHits).toBe(2);
  });
});

describe("incident 26 : le recul ne raccourcit jamais", () => {
  it("incident-26-backoff-never-shortens", () => {
    const far = onQuotaHit(
      startQuotaState(),
      signal({ id: "a", resetAt: NOW + 3 * HOUR }),
      NOW,
      0,
      BACKOFF,
    );
    expect(far.resumeAt).toBe(NOW + 3 * HOUR);
    for (const shorter of [
      signal({ id: "b", resetAt: NOW + MINUTE }),
      signal({ id: "c", retryAfterMs: 1000 }),
      signal({ id: "d" }),
    ]) {
      const next = onQuotaHit(far, shorter, NOW + 10, 0, BACKOFF);
      expect(next.resumeAt as number).toBeGreaterThanOrEqual(far.resumeAt as number);
    }
    const longer = onQuotaHit(
      far,
      signal({ id: "e", resetAt: NOW + 5 * HOUR }),
      NOW + 20,
      0,
      BACKOFF,
    );
    expect(longer.resumeAt).toBe(NOW + 5 * HOUR);
  });
});
