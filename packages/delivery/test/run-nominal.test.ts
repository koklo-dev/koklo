import { describe, expect, it } from "vitest";
import { applyEvent, isTerminal, type Run, resumePoint, startRun } from "../src/index.ts";
import { event, LIMITS, NOMINAL_PATH, runAt } from "./helpers.ts";

const NOMINAL_EVENTS = [
  "worktree_ready",
  "dev_done",
  "gates_green",
  "pr_opened",
  "ci_green",
  "verdict_approve",
  "merge_done",
  "deploy_green",
] as const;

describe("startRun", () => {
  it("crée un run leased, version 0, compteurs à zéro, sans blocage", () => {
    expect(startRun({ ticket: "TK-72" })).toEqual({
      ticket: "TK-72",
      state: "leased",
      attempts: 0,
      reviewRounds: 0,
      ciWaits: 0,
      blocked: null,
      branch: null,
      pullRequest: null,
      lastReviewedAfterFix: false,
      version: 0,
    });
  });

  it("reprend les compteurs du ticket passés en entrée (le ticket reste la source, D7)", () => {
    const run = startRun({ ticket: "TK-9", attempts: 2, reviewRounds: 1 });
    expect([run.attempts, run.reviewRounds]).toEqual([2, 1]);
  });

  it("renvoie un run gelé", () => {
    expect(Object.isFrozen(startRun({ ticket: "TK-72" }))).toBe(true);
  });
});

describe("chemin nominal leased -> deployed_staging", () => {
  const steps = () => {
    const runs: Run[] = [startRun({ ticket: "TK-72" })];
    for (const type of NOMINAL_EVENTS) {
      runs.push(applyEvent(runs[runs.length - 1] as Run, event(type), LIMITS).run);
    }
    return runs;
  };

  it("traverse les 9 états dans l'ordre", () => {
    expect(steps().map((run) => run.state)).toEqual([...NOMINAL_PATH]);
  });

  it("incrémente la version à chaque transition et ne touche aucun compteur", () => {
    steps().forEach((run, index) => {
      expect(run.version).toBe(index);
      expect([run.attempts, run.reviewRounds, run.ciWaits]).toEqual([0, 0, 0]);
      expect(run.blocked).toBeNull();
    });
  });

  it("enregistre la branche (worktree_ready) et la PR (pr_opened)", () => {
    const final = steps().at(-1) as Run;
    expect(final.branch).toBe("koklo/tk-72");
    expect(final.pullRequest).toBe("acme/app#12");
    expect(final.ticket).toBe("TK-72");
  });

  it("demande l'effet suivant à chaque étape (la machine n'exécute rien)", () => {
    const expected = [
      ["start_dev"],
      ["run_gates"],
      ["open_pr"],
      ["wait_ci"],
      ["start_review"],
      ["request_merge"],
      ["await_deploy"],
      [],
    ];
    const runs = steps();
    NOMINAL_EVENTS.forEach((type, index) => {
      const step = applyEvent(runs[index] as Run, event(type), LIMITS);
      expect(
        step.effects.map((effect) => effect.type),
        type,
      ).toEqual(expected[index]);
    });
  });

  it("l'attente de CI est bornée", () => {
    const step = applyEvent(runAt("pr_open"), event("pr_opened"), LIMITS);
    expect(step.effects).toEqual([{ type: "wait_ci", bounded: true }]);
  });

  it("merged n'est pas terminal ; deployed_staging l'est", () => {
    const runs = steps();
    expect(isTerminal((runs[7] as Run).state)).toBe(false);
    expect(isTerminal((runs[8] as Run).state)).toBe(true);
  });
});

describe("terminaux et blocage", () => {
  it("deployed_staging et escalated n'acceptent aucun événement", () => {
    for (const state of ["deployed_staging", "escalated"] as const) {
      expect(isTerminal(state)).toBe(true);
    }
  });

  it("block mène à blocked avec la cause typée et la sortie brute, et notifie", () => {
    const step = applyEvent(
      runAt("developing"),
      { type: "block", cause: "ambiguous_spec", output: "spec unclear" },
      LIMITS,
    );
    expect(step.run.state).toBe("blocked");
    expect(step.run.blocked).toEqual({
      cause: "ambiguous_spec",
      detail: { output: "spec unclear" },
    });
    expect(step.effects).toEqual([{ type: "notify", cause: "ambiguous_spec" }]);
  });

  it("dev_done avec diff vide mène à blocked(no_output) avec la sortie et remoteBranchExists", () => {
    const step = applyEvent(
      runAt("developing"),
      { type: "dev_done", diffEmpty: true, remoteBranchExists: true, output: "git diff: empty" },
      LIMITS,
    );
    expect(step.run.state).toBe("blocked");
    expect(step.run.blocked).toEqual({
      cause: "no_output",
      detail: { output: "git diff: empty", remoteBranchExists: true },
    });
  });

  it("escalate depuis blocked mène à escalated et demande l'effet escalate", () => {
    const step = applyEvent(runAt("blocked"), event("escalate"), LIMITS);
    expect(step.run.state).toBe("escalated");
    expect(step.effects.map((effect) => effect.type)).toEqual(["escalate"]);
  });

  it("quota_hit est neutre : même run, aucun effet (D2)", () => {
    const run = runAt("ci_wait", { attempts: 1, version: 5 });
    const step = applyEvent(run, event("quota_hit"), LIMITS);
    expect(step.run).toEqual(run);
    expect(step.effects).toEqual([]);
  });
});

describe("resumePoint", () => {
  it("renvoie l'étape à reprendre depuis l'état persisté", () => {
    const expected = {
      leased: "prepare_worktree",
      developing: "start_dev",
      local_gates: "run_gates",
      pr_open: "open_pr",
      ci_wait: "wait_ci",
      reviewing: "start_review",
      merge_requested: "request_merge",
      merged: "await_deploy",
      blocked: "escalate",
    } as const;
    for (const [state, type] of Object.entries(expected)) {
      expect(resumePoint(runAt(state as keyof typeof expected))?.type, state).toBe(type);
    }
  });

  it("ne renvoie rien pour un état terminal", () => {
    expect(resumePoint(runAt("deployed_staging"))).toBeNull();
    expect(resumePoint(runAt("escalated"))).toBeNull();
  });

  it("n'a pas besoin de mémoire : un run relu du JSON reprend au même point", () => {
    const run = runAt("ci_wait", { version: 4, pullRequest: "acme/app#1" });
    expect(resumePoint(JSON.parse(JSON.stringify(run)))).toEqual(resumePoint(run));
  });
});
