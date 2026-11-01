import { describe, expect, it } from "vitest";
import {
  applyEvent,
  canRestartDevelopment,
  ResumeRequiredError,
  resumePoint,
  startRun,
} from "../src/index.ts";
import { deepFreeze, event, LIMITS, runAt } from "./helpers.ts";

const PUSHED = { branch: "koklo/tk-72", pullRequest: "acme/app#12" } as const;

describe("ResumeRequiredError", () => {
  it("est une Error nommée qui expose ticket, branche et PR lisibles", () => {
    const error = new ResumeRequiredError("TK-72", "koklo/tk-72", "acme/app#12");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ResumeRequiredError");
    expect([error.ticket, error.branch, error.pullRequest]).toEqual([
      "TK-72",
      "koklo/tk-72",
      "acme/app#12",
    ]);
    expect(error.message).toContain("TK-72");
  });
});

describe("canRestartDevelopment", () => {
  it("vrai sans branche, vrai avec une branche seule, faux avec branche poussée et PR ouverte", () => {
    expect(canRestartDevelopment(runAt("leased"))).toBe(true);
    expect(canRestartDevelopment(runAt("leased", { branch: "koklo/tk-72" }))).toBe(true);
    expect(canRestartDevelopment(runAt("leased", PUSHED))).toBe(false);
    expect(canRestartDevelopment(runAt("ci_wait", PUSHED))).toBe(false);
  });
});

describe("reprise d'un run dont la branche est poussée avec une PR ouverte", () => {
  it("startRun avec branche et PR reprend en ci_wait (jamais en leased/developing), version 0", () => {
    const run = startRun({ ticket: "TK-72", ...PUSHED });
    expect(run).toMatchObject({
      state: "ci_wait",
      ...PUSHED,
      version: 0,
      attempts: 0,
      blocked: null,
    });
    expect(Object.isFrozen(run)).toBe(true);
    expect(resumePoint(run)).toEqual({ type: "wait_ci", bounded: true });
  });

  it("startRun avec une branche seule reste leased et garde la branche", () => {
    const run = startRun({ ticket: "TK-72", branch: "koklo/tk-72" });
    expect([run.state, run.branch, run.pullRequest]).toEqual(["leased", "koklo/tk-72", null]);
  });

  it("startRun sans branche ni PR (null explicites) reste le run neuf du lot 1", () => {
    const run = startRun({ ticket: "TK-72", branch: null, pullRequest: null });
    expect([run.state, run.branch, run.pullRequest]).toEqual(["leased", null, null]);
  });

  it("un run leased persisté avec branche et PR refuse worktree_ready : ResumeRequiredError", () => {
    const run = deepFreeze(runAt("leased", PUSHED));
    let caught: unknown;
    try {
      applyEvent(run, event("worktree_ready"), LIMITS);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ResumeRequiredError);
    expect(caught).toMatchObject({ ticket: "TK-72", ...PUSHED });
  });

  it("la même garde vaut pour resumePoint d'un tel run leased", () => {
    expect(() => resumePoint(runAt("leased", PUSHED))).toThrow(ResumeRequiredError);
  });

  it("une branche seule redémarre normalement (la branche existante est réutilisée)", () => {
    const run = runAt("leased", { branch: "koklo/tk-72" });
    expect(applyEvent(run, event("worktree_ready"), LIMITS).run.state).toBe("developing");
  });

  it("une boucle de correction avec PR ouverte (developing) n'est pas une reprise de zéro", () => {
    const run = runAt("developing", { ...PUSHED, attempts: 1 });
    expect(applyEvent(run, event("dev_done"), LIMITS).run.state).toBe("local_gates");
    expect(resumePoint(run)?.type).toBe("start_dev");
  });
});
