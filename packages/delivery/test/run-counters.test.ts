import { describe, expect, it } from "vitest";
import { applyEvent, InvalidRunEventError, type RunLimits } from "../src/index.ts";
import { event, LIMITS, runAt } from "./helpers.ts";

const types = (step: { effects: readonly { type: string }[] }) => step.effects.map((e) => e.type);

describe("compteurs de tentatives (attempts, partagés par gates_red et ci_red)", () => {
  it("gates_red : attempts +1, retour en développement, rien d'autre ne bouge", () => {
    const step = applyEvent(
      runAt("local_gates", { attempts: 1, version: 7 }),
      event("gates_red"),
      LIMITS,
    );
    expect(step.run).toMatchObject({
      state: "developing",
      attempts: 2,
      reviewRounds: 0,
      ciWaits: 0,
      version: 8,
    });
    expect(step.run.blocked).toBeNull();
    expect(types(step)).toEqual(["start_dev"]);
  });

  it("ci_red : attempts +1, même compteur que gates_red", () => {
    const step = applyEvent(runAt("ci_wait", { attempts: 2 }), event("ci_red"), LIMITS);
    expect(step.run).toMatchObject({
      state: "developing",
      attempts: 3,
      reviewRounds: 0,
      ciWaits: 0,
    });
  });

  it("dev_done, gates_green, pr_opened, ci_green, verdict_approve ne comptent rien", () => {
    const cases = [
      ["developing", "dev_done"],
      ["local_gates", "gates_green"],
      ["pr_open", "pr_opened"],
      ["ci_wait", "ci_green"],
      ["reviewing", "verdict_approve"],
    ] as const;
    for (const [state, type] of cases) {
      const run = applyEvent(
        runAt(state, { attempts: 1, reviewRounds: 1, ciWaits: 1 }),
        event(type),
        LIMITS,
      ).run;
      expect([run.attempts, run.reviewRounds, run.ciWaits], type).toEqual([1, 1, 1]);
    }
  });
});

describe("plafond des tentatives (RunLimits.maxAttempts)", () => {
  it("au plafond, gates_red bloque en ci_failed sans dépasser le plafond", () => {
    const step = applyEvent(runAt("local_gates", { attempts: 3 }), event("gates_red"), LIMITS);
    expect(step.run.state).toBe("blocked");
    expect(step.run.attempts).toBe(3);
    expect(step.run.blocked?.cause).toBe("ci_failed");
    expect(step.run.blocked?.detail.output.trim()).not.toBe("");
    expect(step.run.version).toBe(1);
    expect(step.effects).toEqual([{ type: "notify", cause: "ci_failed" }]);
  });

  it("au plafond, ci_red bloque en ci_failed", () => {
    const step = applyEvent(runAt("ci_wait", { attempts: 3 }), event("ci_red"), LIMITS);
    expect([step.run.state, step.run.blocked?.cause, step.run.attempts]).toEqual([
      "blocked",
      "ci_failed",
      3,
    ]);
  });

  it("le plafond vient de RunLimits, jamais codé en dur", () => {
    const tight: RunLimits = { maxAttempts: 1, maxReviewRounds: 4, maxCiWaits: 3 };
    const first = applyEvent(runAt("local_gates"), event("gates_red"), tight).run;
    expect(first.attempts).toBe(1);
    const second = applyEvent({ ...first, state: "ci_wait" }, event("ci_red"), tight).run;
    expect(second.state).toBe("blocked");
    const wide: RunLimits = { maxAttempts: 10, maxReviewRounds: 4, maxCiWaits: 3 };
    expect(applyEvent(runAt("ci_wait", { attempts: 3 }), event("ci_red"), wide).run.state).toBe(
      "developing",
    );
  });

  it("maxAttempts 0 : la première tentative est déjà refusée", () => {
    const zero: RunLimits = { maxAttempts: 0, maxReviewRounds: 4, maxCiWaits: 3 };
    const run = applyEvent(runAt("local_gates"), event("gates_red"), zero).run;
    expect([run.state, run.attempts, run.blocked?.cause]).toEqual(["blocked", 0, "ci_failed"]);
  });

  it("les tentatives déjà consommées sur le ticket comptent (pas de double comptage, D7)", () => {
    const run = applyEvent(
      runAt("local_gates", { attempts: LIMITS.maxAttempts }),
      event("gates_red"),
      LIMITS,
    ).run;
    expect(run.state).toBe("blocked");
  });
});

describe("compteur de rounds de review (reviewRounds)", () => {
  it("verdict_request_changes : reviewRounds +1, attempts intact, relecture finale non acquise", () => {
    const step = applyEvent(
      runAt("reviewing", { reviewRounds: 1, attempts: 2 }),
      event("verdict_request_changes"),
      LIMITS,
    );
    expect(step.run).toMatchObject({
      state: "developing",
      reviewRounds: 2,
      attempts: 2,
      lastReviewedAfterFix: false,
    });
    expect(types(step)).toEqual(["start_dev"]);
  });

  it("le dernier round autorisé est accepté (reviewRounds atteint le plafond sans bloquer)", () => {
    const run = applyEvent(
      runAt("reviewing", { reviewRounds: 3 }),
      event("verdict_request_changes"),
      LIMITS,
    ).run;
    expect([run.state, run.reviewRounds, run.blocked]).toEqual(["developing", 4, null]);
  });

  it("maxReviewRounds vient de RunLimits", () => {
    const one: RunLimits = { maxAttempts: 3, maxReviewRounds: 1, maxCiWaits: 3 };
    const run = applyEvent(
      runAt("reviewing", { reviewRounds: 1 }),
      event("verdict_request_changes"),
      one,
    ).run;
    expect(run.state).toBe("blocked");
  });
});

describe("plafond des rounds de review et relecture finale", () => {
  it("au plafond de rounds, un nouveau changement demandé bloque en review_exhausted", () => {
    const step = applyEvent(
      runAt("reviewing", { reviewRounds: 4, lastReviewedAfterFix: true }),
      event("verdict_request_changes"),
      LIMITS,
    );
    expect(step.run.state).toBe("blocked");
    expect(step.run.reviewRounds).toBe(4);
    expect(step.run.blocked?.cause).toBe("review_exhausted");
    expect(step.run.blocked?.detail.output.trim()).not.toBe("");
    expect(step.effects).toEqual([{ type: "notify", cause: "review_exhausted" }]);
  });

  it("l'entrée en review au plafond de rounds marque la relecture finale ; avant, non", () => {
    const final = applyEvent(runAt("ci_wait", { reviewRounds: 4 }), event("ci_green"), LIMITS).run;
    expect([final.state, final.lastReviewedAfterFix]).toEqual(["reviewing", true]);
    const early = applyEvent(runAt("ci_wait", { reviewRounds: 3 }), event("ci_green"), LIMITS).run;
    expect(early.lastReviewedAfterFix).toBe(false);
  });

  it("approuver la relecture finale mène au merge", () => {
    const run = applyEvent(
      runAt("reviewing", { reviewRounds: 4, lastReviewedAfterFix: true }),
      event("verdict_approve"),
      LIMITS,
    ).run;
    expect(run.state).toBe("merge_requested");
  });
});

describe("compteur d'attentes de CI (ciWaits)", () => {
  it("ci_timeout : reste en ci_wait, ciWaits +1, attempts et reviewRounds intacts", () => {
    const step = applyEvent(
      runAt("ci_wait", { attempts: 3, reviewRounds: 4, ciWaits: 1, version: 2 }),
      event("ci_timeout"),
      LIMITS,
    );
    expect(step.run).toMatchObject({
      state: "ci_wait",
      attempts: 3,
      reviewRounds: 4,
      ciWaits: 2,
      version: 3,
    });
    expect(step.run.blocked).toBeNull();
    expect(step.effects).toEqual([{ type: "wait_ci", bounded: true }]);
  });

  it("au plafond d'attentes, bloque en ci_timeout (jamais ci_failed), compteur inchangé", () => {
    const step = applyEvent(runAt("ci_wait", { ciWaits: 3 }), event("ci_timeout"), LIMITS);
    expect(step.run.state).toBe("blocked");
    expect(step.run.blocked?.cause).toBe("ci_timeout");
    expect(step.run.ciWaits).toBe(3);
    expect(step.run.attempts).toBe(0);
    expect(step.effects).toEqual([{ type: "notify", cause: "ci_timeout" }]);
  });

  it("maxCiWaits vient de RunLimits", () => {
    const none: RunLimits = { maxAttempts: 3, maxReviewRounds: 4, maxCiWaits: 0 };
    expect(applyEvent(runAt("ci_wait"), event("ci_timeout"), none).run.state).toBe("blocked");
  });
});

describe("conflit_detected : aucun coût", () => {
  it("renvoie en développement sans toucher aucun compteur, même aux plafonds", () => {
    const run = runAt("ci_wait", { attempts: 3, reviewRounds: 4, ciWaits: 3 });
    const step = applyEvent(run, event("conflict_detected"), LIMITS);
    expect(step.run).toMatchObject({
      state: "developing",
      attempts: 3,
      reviewRounds: 4,
      ciWaits: 3,
    });
    expect(step.run.blocked).toBeNull();
    expect(types(step)).toEqual(["start_dev"]);
  });
});

describe("limites invalides", () => {
  it.each([
    { maxAttempts: -1, maxReviewRounds: 4, maxCiWaits: 3 },
    { maxAttempts: 1.5, maxReviewRounds: 4, maxCiWaits: 3 },
    { maxAttempts: 3, maxReviewRounds: Number.NaN, maxCiWaits: 3 },
    { maxAttempts: 3, maxReviewRounds: 4, maxCiWaits: Number.POSITIVE_INFINITY },
    { maxAttempts: 3, maxReviewRounds: 4 },
    undefined,
  ])("refuse %j avec InvalidRunEventError, même pour un événement neutre", (limits) => {
    const bad = limits as unknown as RunLimits;
    expect(() => applyEvent(runAt("leased"), event("worktree_ready"), bad)).toThrow(
      InvalidRunEventError,
    );
    expect(() => applyEvent(runAt("local_gates"), event("gates_red"), bad)).toThrow(
      InvalidRunEventError,
    );
  });
});

describe("escalate : remise à zéro des compteurs (incidents 7 et 8)", () => {
  it("blocked -> escalated remet attempts, reviewRounds et ciWaits à zéro et garde la cause", () => {
    const run = runAt("blocked", {
      attempts: 3,
      reviewRounds: 4,
      ciWaits: 2,
      version: 9,
      blocked: { cause: "review_exhausted", detail: { output: "4 rounds" } },
    });
    const step = applyEvent(run, event("escalate"), LIMITS);
    expect(step.run).toMatchObject({
      state: "escalated",
      attempts: 0,
      reviewRounds: 0,
      ciWaits: 0,
      version: 10,
    });
    expect(step.run.blocked).toEqual({ cause: "review_exhausted", detail: { output: "4 rounds" } });
    expect(types(step)).toEqual(["escalate"]);
  });

  it("aucun autre événement ne remet un compteur à zéro", () => {
    const run = runAt("local_gates", { attempts: 2, reviewRounds: 3, ciWaits: 1 });
    const next = applyEvent(run, event("gates_red"), LIMITS).run;
    expect([next.attempts, next.reviewRounds, next.ciWaits]).toEqual([3, 3, 1]);
    const blocked = applyEvent(run, event("block"), LIMITS).run;
    expect([blocked.attempts, blocked.reviewRounds, blocked.ciWaits]).toEqual([2, 3, 1]);
  });
});
