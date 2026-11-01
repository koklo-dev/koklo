import { describe, expect, it } from "vitest";
import { applyEvent, InvalidRunTransitionError, StaleRunError } from "../src/index.ts";
import { deepFreeze, event, LIMITS, runAt } from "./helpers.ts";

const REPLAYS = [
  ["merge_done", "merged"],
  ["deploy_green", "deployed_staging"],
  ["escalate", "escalated"],
] as const;

describe("rejeu idempotent de merge_done, deploy_green et escalate", () => {
  it.each(REPLAYS)("%s rejoué sur %s : même run, version inchangée, aucun effet", (type, state) => {
    const run = deepFreeze(runAt(state, { version: 6, attempts: 0 }));
    const step = applyEvent(run, event(type), LIMITS);
    expect(step.run).toEqual(run);
    expect(step.effects).toEqual([]);
  });

  it.each(REPLAYS)(
    "%s rejoué avec l'expectedVersion de l'original ou la courante : no-op",
    (type, state) => {
      const run = runAt(state, { version: 6 });
      for (const expectedVersion of [5, 6]) {
        const step = applyEvent(run, { ...event(type), expectedVersion }, LIMITS);
        expect(step.run, `${type}/${expectedVersion}`).toEqual(run);
        expect(step.effects).toEqual([]);
      }
    },
  );

  it("la première application passe par la transition normale puis le rejeu est sans effet", () => {
    const requested = runAt("merge_requested", { version: 3 });
    const first = applyEvent(requested, { ...event("merge_done"), expectedVersion: 3 }, LIMITS);
    expect([first.run.state, first.run.version]).toEqual(["merged", 4]);
    expect(first.effects.map((e) => e.type)).toEqual(["await_deploy"]);
    const replay = applyEvent(first.run, { ...event("merge_done"), expectedVersion: 3 }, LIMITS);
    expect(replay.run).toEqual(first.run);
    expect(replay.effects).toEqual([]);
  });

  it("un rejeu d'escalate ne remet rien à zéro une seconde fois et ne change pas la cause", () => {
    const run = runAt("escalated", {
      version: 4,
      attempts: 2,
      blocked: { cause: "ci_failed", detail: { output: "red" } },
    });
    const step = applyEvent(run, event("escalate"), LIMITS);
    expect(step.run).toEqual(run);
  });
});

describe("événements non idempotents et péremption", () => {
  it("un autre événement rejoué avec une version périmée lève StaleRunError, compteurs intacts", () => {
    const run = runAt("developing", { version: 2, attempts: 1 });
    const first = applyEvent(
      runAt("local_gates", { version: 1, attempts: 0 }),
      { ...event("gates_red"), expectedVersion: 1 },
      LIMITS,
    ).run;
    expect(first).toMatchObject({ state: "developing", attempts: 1, version: 2 });
    expect(() => applyEvent(first, { ...event("gates_red"), expectedVersion: 1 }, LIMITS)).toThrow(
      StaleRunError,
    );
    expect(run.attempts).toBe(1);
  });

  it("sans expectedVersion, un rejeu hors table lève InvalidRunTransitionError (pas de double comptage)", () => {
    const afterRed = applyEvent(runAt("local_gates"), event("gates_red"), LIMITS).run;
    expect(() => applyEvent(afterRed, event("gates_red"), LIMITS)).toThrow(
      InvalidRunTransitionError,
    );
  });

  it("merge_done sur un run déjà déployé n'est pas un rejeu : refusé (version ou table)", () => {
    const deployed = runAt("deployed_staging", { version: 8 });
    expect(() =>
      applyEvent(deployed, { ...event("merge_done"), expectedVersion: 5 }, LIMITS),
    ).toThrow(StaleRunError);
    expect(() => applyEvent(deployed, event("merge_done"), LIMITS)).toThrow(
      InvalidRunTransitionError,
    );
  });

  it("ci_timeout rejoué n'est pas idempotent : chaque attente est comptée une fois, sous contrôle de version", () => {
    const first = applyEvent(
      runAt("ci_wait", { version: 2 }),
      { ...event("ci_timeout"), expectedVersion: 2 },
      LIMITS,
    ).run;
    expect(first.ciWaits).toBe(1);
    expect(() => applyEvent(first, { ...event("ci_timeout"), expectedVersion: 2 }, LIMITS)).toThrow(
      StaleRunError,
    );
  });
});
