import { describe, expect, it } from "vitest";
import {
  allowedEvents,
  applyEvent,
  isRunState,
  type Run,
  type RunLimits,
  startRun,
} from "../src/index.ts";
import { deepFreeze, event, LIMITS, STATES } from "./helpers.ts";

/** Générateur congruentiel linéaire : déterministe, sans Math.random ni dépendance. */
const lcg = (seed: number) => {
  let state = seed >>> 0;
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % bound;
  };
};

const TIGHT: RunLimits = { maxAttempts: 1, maxReviewRounds: 1, maxCiWaits: 1 };
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);
const STEPS = 60;

interface Observation {
  readonly before: Run;
  readonly after: Run;
  readonly type: string;
  readonly limits: RunLimits;
}

/** Joue une marche aléatoire d'événements valides et rend chaque pas observé. */
const walk = (seed: number, limits: RunLimits): Observation[] => {
  const pick = lcg(seed);
  const seen: Observation[] = [];
  let run: Run = deepFreeze(startRun({ ticket: "TK-72" }));
  for (let i = 0; i < STEPS; i++) {
    const options = allowedEvents(run.state);
    if (options.length === 0) break;
    const type = options[pick(options.length)] as (typeof options)[number];
    const snapshot = JSON.stringify(run);
    const after = deepFreeze(applyEvent(run, event(type), limits).run);
    expect(JSON.stringify(run), `entrée mutée par ${type}`).toBe(snapshot);
    seen.push({ before: run, after, type, limits });
    run = after;
  }
  return seen;
};

const all = (limits: RunLimits) => SEEDS.flatMap((seed) => walk(seed, limits));

describe.each([
  ["plafonds par défaut", LIMITS],
  ["plafonds serrés", TIGHT],
])("propriétés (%s)", (_name, limits) => {
  const observations = all(limits);

  it("génère des marches non triviales", () => {
    expect(observations.length).toBeGreaterThan(1000);
  });

  it("les compteurs sont monotones, sauf à l'escalade où ils retombent à zéro", () => {
    for (const { before, after, type } of observations) {
      const keys = ["attempts", "reviewRounds", "ciWaits"] as const;
      for (const key of keys) {
        if (type === "escalate" && before.state === "blocked") expect(after[key]).toBe(0);
        else expect(after[key], `${type}: ${key}`).toBeGreaterThanOrEqual(before[key]);
      }
    }
  });

  it("aucun compteur ne dépasse son plafond", () => {
    for (const { after } of observations) {
      expect(after.attempts).toBeLessThanOrEqual(limits.maxAttempts);
      expect(after.reviewRounds).toBeLessThanOrEqual(limits.maxReviewRounds);
      expect(after.ciWaits).toBeLessThanOrEqual(limits.maxCiWaits);
    }
  });

  it("tout état atteint appartient à RUN_STATES", () => {
    for (const { after } of observations) {
      expect(isRunState(after.state)).toBe(true);
      expect(STATES).toContain(after.state);
    }
  });

  it("la version avance de 1, ou ne bouge pas pour un no-op (quota_hit, rejeu)", () => {
    for (const { before, after, type } of observations) {
      expect([before.version, before.version + 1], type).toContain(after.version);
      if (after.version === before.version) expect(after).toBe(before);
    }
  });

  it("un timeout de CI ne coûte ni tentative ni round, quelle que soit la suite", () => {
    for (const { before, after, type } of observations) {
      if (type !== "ci_timeout") continue;
      expect([after.attempts, after.reviewRounds]).toEqual([before.attempts, before.reviewRounds]);
      expect(["ci_wait", "blocked"]).toContain(after.state);
      if (after.state === "blocked") expect(after.blocked?.cause).toBe("ci_timeout");
    }
  });

  it("un conflit ne coûte jamais rien", () => {
    for (const { before, after, type } of observations) {
      if (type !== "conflict_detected") continue;
      expect([after.attempts, after.reviewRounds, after.ciWaits]).toEqual([
        before.attempts,
        before.reviewRounds,
        before.ciWaits,
      ]);
    }
  });

  it("un blocage dû à un plafond porte une cause typée et une sortie non vide", () => {
    for (const { before, after, type } of observations) {
      if (after.state !== "blocked" || before.state === "blocked" || type === "block") continue;
      expect(after.blocked?.detail.output.trim().length).toBeGreaterThan(0);
    }
  });
});
