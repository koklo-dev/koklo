import { describe, expect, it } from "vitest";
import {
  allowedEvents,
  applyEvent,
  canApply,
  InvalidRunTransitionError,
  isRunState,
  type Run,
  type RunState,
} from "../src/index.ts";
import { EVENT_TYPES, event, LIMITS, REFERENCE, runAt, STATES } from "./helpers.ts";

const pairs = STATES.flatMap((state) => EVENT_TYPES.map((type) => ({ state, type })));

describe("table de transitions exhaustive (états x événements)", () => {
  it("couvre les 11 x 16 couples", () => {
    expect(pairs).toHaveLength(11 * 16);
  });

  it.each(pairs)("$state + $type : canApply suit la référence", ({ state, type }) => {
    expect(canApply(state, type)).toBe(REFERENCE[state][type] !== undefined);
  });

  it.each(pairs)("$state + $type : applyEvent suit la référence", ({ state, type }) => {
    const expected = REFERENCE[state][type];
    const run = runAt(state);
    if (expected === undefined) {
      expect(() => applyEvent(run, event(type), LIMITS)).toThrow(InvalidRunTransitionError);
      return;
    }
    expect(applyEvent(run, event(type), LIMITS).run.state).toBe(expected);
  });

  it("allowedEvents liste exactement les événements de la référence, pour chaque état", () => {
    for (const state of STATES) {
      expect([...allowedEvents(state)].sort(), state).toEqual(Object.keys(REFERENCE[state]).sort());
    }
  });

  it("canApply refuse un état ou un type d'événement inconnu", () => {
    expect(canApply("nope", "gates_green")).toBe(false);
    expect(canApply("leased", "nope")).toBe(false);
    expect(canApply(null, undefined)).toBe(false);
  });

  it("tout état est atteignable depuis leased par des événements valides, et seulement des états connus", () => {
    const seen = new Set<RunState>(["leased"]);
    const queue: Run[] = [runAt("leased")];
    for (let run = queue.shift(); run !== undefined; run = queue.shift()) {
      for (const type of allowedEvents(run.state)) {
        const next = applyEvent(run, event(type), LIMITS).run;
        expect(isRunState(next.state), next.state).toBe(true);
        if (!seen.has(next.state)) {
          seen.add(next.state);
          queue.push(next);
        }
      }
    }
    expect([...seen].sort()).toEqual([...STATES].sort());
  });
});
