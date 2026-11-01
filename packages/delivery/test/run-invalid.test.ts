import { describe, expect, it } from "vitest";
import {
  applyEvent,
  InvalidRunEventError,
  InvalidRunStateError,
  InvalidRunTransitionError,
  StaleRunError,
} from "../src/index.ts";
import { event, LIMITS, runAt, SECRET_OUTPUT } from "./helpers.ts";

const capture = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("transitions invalides", () => {
  it("lève InvalidRunTransitionError avec l'état, l'événement et un message lisible", () => {
    const error = capture(() => applyEvent(runAt("leased"), event("merge_done"), LIMITS));
    expect(error).toBeInstanceOf(InvalidRunTransitionError);
    const typed = error as InvalidRunTransitionError;
    expect(typed.name).toBe("InvalidRunTransitionError");
    expect(typed.from).toBe("leased");
    expect(typed.event).toBe("merge_done");
    expect(typed.message).toContain("leased");
    expect(typed.message).toContain("merge_done");
  });

  it("n'expose aucune donnée de l'événement dans l'erreur (ni message, ni champs)", () => {
    const error = capture(() => applyEvent(runAt("blocked"), event("block"), LIMITS)) as Error;
    expect(error).toBeInstanceOf(InvalidRunTransitionError);
    expect(error.message).not.toContain(SECRET_OUTPUT);
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain("ghp_SECRET");
  });

  it("les états terminaux refusent block et worktree_ready (seuls les rejeux idempotents passent, lot 2)", () => {
    for (const state of ["deployed_staging", "escalated"] as const) {
      for (const type of ["block", "worktree_ready", "merge_done"] as const) {
        expect(() => applyEvent(runAt(state), event(type), LIMITS), `${state}/${type}`).toThrow(
          InvalidRunTransitionError,
        );
      }
    }
  });

  it("deployed_staging refuse escalate, escalated refuse deploy_green", () => {
    expect(() => applyEvent(runAt("deployed_staging"), event("escalate"), LIMITS)).toThrow(
      InvalidRunTransitionError,
    );
    expect(() => applyEvent(runAt("escalated"), event("deploy_green"), LIMITS)).toThrow(
      InvalidRunTransitionError,
    );
  });

  it("escalate n'est possible que depuis blocked (hors rejeu sur escalated)", () => {
    expect(() => applyEvent(runAt("reviewing"), event("escalate"), LIMITS)).toThrow(
      InvalidRunTransitionError,
    );
  });

  it("un échec ne modifie pas le run d'entrée", () => {
    const run = runAt("leased");
    const before = JSON.stringify(run);
    expect(() => applyEvent(run, event("ci_green"), LIMITS)).toThrow(InvalidRunTransitionError);
    expect(JSON.stringify(run)).toBe(before);
  });
});

describe("entrées malformées", () => {
  it("refuse un état de run inconnu (InvalidRunStateError)", () => {
    const run = { ...runAt("leased"), state: "bogus" } as never;
    const error = capture(() => applyEvent(run, event("worktree_ready"), LIMITS));
    expect(error).toBeInstanceOf(InvalidRunStateError);
    expect((error as InvalidRunStateError).value).toBe("bogus");
  });

  it("refuse un événement inconnu ou mal formé (InvalidRunEventError)", () => {
    for (const bad of [{ type: "bogus" }, {}, null, undefined, "gates_green", { type: 3 }]) {
      expect(() => applyEvent(runAt("leased"), bad as never, LIMITS), String(bad)).toThrow(
        InvalidRunEventError,
      );
    }
  });

  it("refuse un block avec cause inconnue ou sortie vide, et un diff vide sans sortie", () => {
    const bad = [
      { type: "block", cause: "other", output: "x" },
      { type: "block", cause: "git_error", output: "" },
      { type: "dev_done", diffEmpty: true, remoteBranchExists: false },
    ];
    for (const e of bad) {
      expect(() => applyEvent(runAt("developing"), e as never, LIMITS)).toThrow(
        InvalidRunEventError,
      );
    }
  });
});

describe("StaleRunError (concurrence optimiste)", () => {
  it("lève StaleRunError si expectedVersion ne correspond pas à la version du run", () => {
    const run = runAt("leased", { version: 3 });
    const error = capture(() =>
      applyEvent(run, { ...event("worktree_ready"), expectedVersion: 2 }, LIMITS),
    );
    expect(error).toBeInstanceOf(StaleRunError);
    expect((error as StaleRunError).expectedVersion).toBe(2);
    expect((error as StaleRunError).actualVersion).toBe(3);
    expect((error as StaleRunError).name).toBe("StaleRunError");
  });

  it("applique l'événement quand expectedVersion est égale, ou absente", () => {
    const run = runAt("leased", { version: 3 });
    expect(
      applyEvent(run, { ...event("worktree_ready"), expectedVersion: 3 }, LIMITS).run.version,
    ).toBe(4);
    expect(applyEvent(run, event("worktree_ready"), LIMITS).run.version).toBe(4);
  });

  it("la péremption est testée avant la table (ordre : état, événement, version, transition)", () => {
    const run = runAt("leased", { version: 1 });
    expect(() => applyEvent(run, { ...event("merge_done"), expectedVersion: 0 }, LIMITS)).toThrow(
      StaleRunError,
    );
  });
});
