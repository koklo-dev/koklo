import { describe, expect, it } from "vitest";
import {
  applyEvent,
  BLOCK_CAUSES,
  ResumeRequiredError,
  type RunLimits,
  startRun,
} from "../src/index.ts";
import { event, LIMITS, play, runAt, TO_CI_WAIT, TO_REVIEWING } from "./helpers.ts";

const GIT_OUTPUT = "On branch koklo/tk-72\nnothing to commit, working tree clean";

describe("incident 11 (annexe C §C.5)", () => {
  it("incident-11-ci-timeout-is-not-a-failure", () => {
    // Un timeout de CI n'est jamais un échec : état ci_wait, aucune tentative, jamais ci_failed.
    let run = runAt("ci_wait", { attempts: LIMITS.maxAttempts, reviewRounds: 2 });
    for (let waits = 1; waits <= LIMITS.maxCiWaits; waits++) {
      const step = applyEvent(run, event("ci_timeout"), LIMITS);
      run = step.run;
      expect(run.state).toBe("ci_wait");
      expect(run.attempts).toBe(LIMITS.maxAttempts);
      expect(run.reviewRounds).toBe(2);
      expect(run.ciWaits).toBe(waits);
      expect(run.blocked).toBeNull();
      expect(step.effects).toEqual([{ type: "wait_ci", bounded: true }]);
    }
    // L'attente est bornée : l'épuisement a sa cause propre, distincte d'un échec de CI.
    const exhausted = applyEvent(run, event("ci_timeout"), LIMITS).run;
    expect(exhausted.state).toBe("blocked");
    expect(exhausted.blocked?.cause).toBe("ci_timeout");
    expect(exhausted.blocked?.cause).not.toBe("ci_failed");
    expect(exhausted.attempts).toBe(LIMITS.maxAttempts);
    // Un vrai échec (ci_red) reste, lui, une tentative.
    const failed = applyEvent(runAt("ci_wait", { attempts: 1 }), event("ci_red"), LIMITS).run;
    expect(failed.attempts).toBe(2);
  });
});

describe("incident 12 (annexe C §C.5)", () => {
  it("incident-12-conflict-costs-no-review-round", () => {
    // Un conflit détecté en CI renvoie en développement sans tentative ni round de review.
    const start = runAt("ci_wait", {
      attempts: 2,
      reviewRounds: 2,
      branch: "koklo/tk-72",
      pullRequest: "acme/app#12",
    });
    const conflicted = applyEvent(start, event("conflict_detected"), LIMITS);
    expect(conflicted.run.state).toBe("developing");
    expect([conflicted.run.attempts, conflicted.run.reviewRounds]).toEqual([2, 2]);
    // Le correctif repasse gates, CI, puis la review : toujours aucun round consommé.
    const back = play(conflicted.run, TO_REVIEWING);
    expect(back.state).toBe("reviewing");
    expect([back.attempts, back.reviewRounds]).toEqual([2, 2]);
    // Même au plafond de rounds, un conflit ne fait pas basculer en review_exhausted.
    const capped = applyEvent(
      runAt("ci_wait", { reviewRounds: LIMITS.maxReviewRounds }),
      event("conflict_detected"),
      LIMITS,
    ).run;
    expect(capped.state).toBe("developing");
    expect(capped.blocked).toBeNull();
    expect(capped.reviewRounds).toBe(LIMITS.maxReviewRounds);
  });
});

describe("incident 13 (annexe C §C.5)", () => {
  it("incident-13-last-fix-reviewed-before-exhaustion", () => {
    // Le dernier correctif est relu avant review_exhausted : jamais d'épuisement sans cette relecture.
    const limits: RunLimits = { maxAttempts: 3, maxReviewRounds: 2, maxCiWaits: 3 };
    let run = runAt("reviewing");
    run = applyEvent(run, event("verdict_request_changes"), limits).run;
    expect(run.reviewRounds).toBe(1);
    run = play(run, TO_REVIEWING, limits);
    expect(run.lastReviewedAfterFix).toBe(false);
    // Deuxième et dernier round autorisé : retour en développement, pas de blocage.
    run = applyEvent(run, event("verdict_request_changes"), limits).run;
    expect([run.state, run.reviewRounds, run.blocked]).toEqual(["developing", 2, null]);
    // Le dernier correctif est livré puis RELU.
    run = play(run, TO_REVIEWING, limits);
    expect(run.state).toBe("reviewing");
    expect(run.lastReviewedAfterFix).toBe(true);
    // Relue et approuvée : on merge, aucun épuisement.
    expect(applyEvent(run, event("verdict_approve"), limits).run.state).toBe("merge_requested");
    // Relue et encore refusée : seulement alors review_exhausted.
    const exhausted = applyEvent(run, event("verdict_request_changes"), limits);
    expect(exhausted.run.state).toBe("blocked");
    expect(exhausted.run.blocked?.cause).toBe("review_exhausted");
    expect(exhausted.run.reviewRounds).toBe(2);
  });
});

describe("incident 17 (annexe C §C.5)", () => {
  it("incident-17-pushed-branch-never-restarts-development", () => {
    // Une branche poussée avec PR ouverte se reprend ; elle ne repart jamais en développement de zéro.
    const pushed = { branch: "koklo/tk-72", pullRequest: "acme/app#12" };
    const resumed = startRun({ ticket: "TK-72", ...pushed });
    expect(resumed.state).toBe("ci_wait");
    expect(resumed.state).not.toBe("developing");
    expect(resumed.state).not.toBe("leased");
    // Un run leased persisté avec ces valeurs refuse de repartir : reprise obligatoire.
    const stale = runAt("leased", pushed);
    expect(() => applyEvent(stale, event("worktree_ready"), LIMITS)).toThrow(ResumeRequiredError);
    // La branche et la PR survivent à une boucle de correction.
    const looped = play(resumed, ["ci_red"]);
    expect(looped.state).toBe("developing");
    expect([looped.branch, looped.pullRequest]).toEqual([pushed.branch, pushed.pullRequest]);
    // no_output avec une branche distante existante le dit explicitement.
    const empty = applyEvent(
      runAt("developing", pushed),
      { type: "dev_done", diffEmpty: true, remoteBranchExists: true, output: GIT_OUTPUT },
      LIMITS,
    ).run;
    expect(empty.blocked?.detail.remoteBranchExists).toBe(true);
  });
});

describe("incident 18 (annexe C §C.5)", () => {
  it("incident-18-empty-diff-is-no_output-with-git-output", () => {
    // Un diff vide est no_output avec la sortie git jointe, jamais « PR impossible ».
    for (const remoteBranchExists of [true, false]) {
      const step = applyEvent(
        runAt("developing"),
        { type: "dev_done", diffEmpty: true, remoteBranchExists, output: GIT_OUTPUT },
        LIMITS,
      );
      expect(step.run.state).toBe("blocked");
      expect(step.run.blocked).toEqual({
        cause: "no_output",
        detail: { output: GIT_OUTPUT, remoteBranchExists },
      });
      expect(step.run.blocked?.cause).not.toBe("git_error");
      expect(step.run.attempts).toBe(0);
      expect(step.effects).toEqual([{ type: "notify", cause: "no_output" }]);
    }
    // Aucune cause fourre-tout ni « PR impossible » : chaque cause réelle a son type.
    expect(BLOCK_CAUSES).toContain("no_output");
    for (const vague of ["pr_impossible", "other", "unknown", "error", "failed"]) {
      expect(BLOCK_CAUSES).not.toContain(vague);
    }
    // Un diff vide sans sortie git jointe est refusé : la sortie est obligatoire.
    expect(() =>
      applyEvent(
        runAt("developing"),
        { type: "dev_done", diffEmpty: true, remoteBranchExists: false },
        LIMITS,
      ),
    ).toThrow();
    // Le chemin normal (diff non vide) n'est pas affecté.
    expect(play(runAt("ci_wait"), ["ci_timeout"]).state).toBe("ci_wait");
    expect(TO_CI_WAIT).toHaveLength(3);
  });
});
