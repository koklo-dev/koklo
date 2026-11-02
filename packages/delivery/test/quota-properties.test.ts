import { beforeAll, describe, expect, it } from "vitest";
import {
  applyEvent,
  canStart,
  onQuotaHit,
  type QuotaState,
  quotaHitEvent,
  type Run,
  recordUsage,
  startQuotaState,
} from "../src/index.ts";
import { deepFreeze, LIMITS, runAt } from "./helpers.ts";
import {
  BACKOFF,
  HOUR,
  lcg,
  NOW,
  OTHER_SCOPES,
  SCOPE,
  signal,
  USAGE,
  usage,
} from "./quota-helpers.ts";

const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);
const STEPS = 40;

interface Step {
  readonly before: QuotaState;
  readonly after: QuotaState;
  readonly now: number;
}

/** Marche déterministe d'appels (hits à gigue variable, usages) sur un état gelé. */
const walk = (seed: number): Step[] => {
  const pick = lcg(seed);
  let state: QuotaState = deepFreeze(startQuotaState());
  let now = NOW;
  const steps: Step[] = [];
  for (let i = 0; i < STEPS; i++) {
    now += pick(3) === 0 ? pick(90) * 1000 : pick(3 * HOUR);
    const before = state;
    state =
      pick(3) === 0
        ? recordUsage(state, usage(`u${seed}-${i}`, { runs: pick(3) }), now, USAGE)
        : onQuotaHit(
            state,
            signal({ id: `s${seed}-${i}`, resetAt: pick(2) === 0 ? now + pick(5 * HOUR) : null }),
            now,
            pick(1000) / 1000,
            BACKOFF,
          );
    deepFreeze(state);
    steps.push({ before, after: state, now });
  }
  return steps;
};

describe("propriétés de l'état de quota (150 graines x 40 pas)", () => {
  let all: Step[] = [];
  beforeAll(() => {
    all = SEEDS.flatMap(walk);
  });

  it("la version ne décroît jamais et croît d'au plus 1 par appel", () => {
    for (const { before, after } of all) {
      expect(after.version - before.version).toBeGreaterThanOrEqual(0);
      expect(after.version - before.version).toBeLessThanOrEqual(1);
    }
  });

  it("resumeAt ne raccourcit jamais tant qu'aucun usage réussi n'a remis le recul à zéro", () => {
    for (const { before, after } of all) {
      if (before.resumeAt !== null && after.resumeAt !== null && after.status !== "ok") {
        expect(after.resumeAt).toBeGreaterThanOrEqual(before.resumeAt);
      }
    }
  });

  it("consecutiveHits reste borné par la politique et l'état est toujours valide", () => {
    for (const { after } of all) {
      expect(after.consecutiveHits).toBeLessThanOrEqual(BACKOFF.maxConsecutiveHits);
      expect(after.usageIds.length).toBeLessThanOrEqual(USAGE.maxSeenIds);
      if (after.status === "ok") expect(after.resumeAt).toBeNull();
      if (after.status === "backoff") expect(after.resumeAt).not.toBeNull();
    }
  });

  it("canStart est monotone en `now` (jamais de re-blocage sans nouvel événement)", () => {
    for (const { after, now } of all) {
      for (const scope of [SCOPE, ...OTHER_SCOPES]) {
        const flags = [0, 1, HOUR / 2, HOUR, 3 * HOUR, 30 * HOUR].map((delta) =>
          canStart(after, now + delta, scope, USAGE),
        );
        const firstTrue = flags.indexOf(true);
        if (firstTrue >= 0 && after.status !== "exhausted") {
          expect(flags.slice(firstTrue).every(Boolean) || after.windows !== undefined).toBe(true);
        }
        if (after.status === "exhausted") expect(flags.every((f) => !f)).toBe(true);
      }
    }
  });

  it("en recul, canStart est faux pour tous les scopes avant resumeAt et vrai après sans plafond", () => {
    for (const { after } of all) {
      if (after.status !== "backoff") continue;
      const resumeAt = after.resumeAt as number;
      for (const scope of [SCOPE, ...OTHER_SCOPES]) {
        expect(canStart(after, resumeAt - 1, scope)).toBe(false);
        expect(canStart(after, resumeAt, scope)).toBe(true);
      }
    }
  });
});

describe("un quota ne modifie jamais le Run", () => {
  it("attempts, reviewRounds, ciWaits, version, état et blocage restent intacts sur 150 marches", () => {
    for (const seed of SEEDS) {
      const pick = lcg(seed);
      let run: Run = deepFreeze(
        runAt("developing", {
          attempts: pick(3),
          reviewRounds: pick(4),
          ciWaits: pick(3),
          version: pick(9),
        }),
      );
      const initial = run;
      let state = startQuotaState();
      for (let i = 0; i < 30; i++) {
        const sig = signal({ id: `s${i}`, kind: pick(5) === 0 ? "exhausted" : "rate_window" });
        state = onQuotaHit(state, sig, NOW + i * pick(2 * HOUR), pick(1000) / 1000, BACKOFF);
        run = applyEvent(run, quotaHitEvent(sig), LIMITS).run;
      }
      expect(run).toEqual(initial);
    }
  });
});
