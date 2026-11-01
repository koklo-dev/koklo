import { describe, expect, it } from "vitest";
import {
  applyEvent,
  InvalidRunEventError,
  InvalidRunStateError,
  type Run,
  startRun,
} from "../src/index.ts";
import { EVENT_TYPES, event, LIMITS, runAt, STATES } from "./helpers.ts";

const SECRET = "ghp_SECRET0123456789";

describe("effets gelés (blocage 1)", () => {
  it("les effets de tous les pas (nominaux, neutres, rejeux, blocages) sont gelés", () => {
    for (const state of STATES) {
      for (const type of EVENT_TYPES) {
        let step: ReturnType<typeof applyEvent>;
        try {
          step = applyEvent(runAt(state), event(type), LIMITS);
        } catch {
          continue;
        }
        expect(Object.isFrozen(step.effects), `${state}/${type}`).toBe(true);
        expect(Object.isFrozen(step), `${state}/${type}`).toBe(true);
      }
    }
  });

  it("une mutation des effets d'un pas neutre ne change rien pour l'appel suivant", () => {
    const first = applyEvent(runAt("ci_wait"), event("quota_hit"), LIMITS);
    expect(() => (first.effects as unknown[]).push({ type: "evil" })).toThrow(TypeError);
    expect(applyEvent(runAt("ci_wait"), event("quota_hit"), LIMITS).effects).toEqual([]);
  });

  it("une mutation des effets d'un rejeu ou d'un pas nominal ne change rien pour l'appel suivant", () => {
    const replay = applyEvent(runAt("merged"), event("merge_done"), LIMITS);
    expect(() => (replay.effects as unknown[]).push({ type: "evil" })).toThrow(TypeError);
    expect(applyEvent(runAt("merged"), event("merge_done"), LIMITS).effects).toEqual([]);
    const nominal = applyEvent(runAt("leased"), event("worktree_ready"), LIMITS);
    expect(() => (nominal.effects as unknown[]).push({ type: "evil" })).toThrow(TypeError);
    expect(applyEvent(runAt("leased"), event("worktree_ready"), LIMITS).effects).toEqual([
      { type: "start_dev" },
    ]);
  });

  it("un run rendu par un pas neutre ou un rejeu est une copie gelée en profondeur", () => {
    const parse = (run: Run): Run => JSON.parse(JSON.stringify(run)) as Run;
    const neutral = applyEvent(parse(runAt("ci_wait")), event("quota_hit"), LIMITS);
    expect(Object.isFrozen(neutral.run)).toBe(true);
    const escalated = runAt("escalated", { blocked: runAt("blocked").blocked });
    const replay = applyEvent(parse(escalated), event("escalate"), LIMITS);
    expect(Object.isFrozen(replay.run)).toBe(true);
    expect(Object.isFrozen(replay.run.blocked)).toBe(true);
    expect(Object.isFrozen(replay.run.blocked?.detail)).toBe(true);
  });
});

describe("charges utiles d'événement (blocage 2)", () => {
  const BAD = [undefined, null, "", "   ", 3, {}, []];

  it.each(BAD)("worktree_ready refuse une branche %j", (branch) => {
    expect(() =>
      applyEvent(runAt("leased"), { type: "worktree_ready", branch } as never, LIMITS),
    ).toThrow(InvalidRunEventError);
  });

  it.each(BAD)("pr_opened refuse une pullRequest %j", (pullRequest) => {
    expect(() =>
      applyEvent(runAt("pr_open"), { type: "pr_opened", pullRequest } as never, LIMITS),
    ).toThrow(InvalidRunEventError);
  });

  it("dev_done exige des booléens diffEmpty et remoteBranchExists", () => {
    for (const bad of [{}, { diffEmpty: false }, { diffEmpty: "no", remoteBranchExists: false }]) {
      expect(() =>
        applyEvent(runAt("developing"), { type: "dev_done", ...bad } as never, LIMITS),
      ).toThrow(InvalidRunEventError);
    }
  });

  it("expectedVersion, s'il est présent, est un entier >= 0", () => {
    for (const expectedVersion of [-1, 1.5, Number.NaN, "0", null]) {
      expect(() =>
        applyEvent(runAt("ci_wait"), { type: "quota_hit", expectedVersion } as never, LIMITS),
      ).toThrow(InvalidRunEventError);
    }
  });

  it("l'erreur ne répète pas la valeur fautive", () => {
    try {
      applyEvent(runAt("leased"), { type: "worktree_ready", branch: 12345 } as never, LIMITS);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRunEventError);
      expect((error as Error).message).not.toContain("12345");
    }
  });
});

describe("startRun valide son entrée (blocage 3)", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, "2", null])(
    "refuse attempts et reviewRounds = %j",
    (value) => {
      expect(() => startRun({ ticket: "TK-1", attempts: value as never })).toThrow(
        InvalidRunEventError,
      );
      expect(() => startRun({ ticket: "TK-1", reviewRounds: value as never })).toThrow(
        InvalidRunEventError,
      );
    },
  );

  it.each(["", "  ", undefined, 3, null])("refuse le ticket %j", (ticket) => {
    expect(() => startRun({ ticket: ticket as never })).toThrow(InvalidRunEventError);
  });

  it.each(["", "  ", 3])("refuse branch et pullRequest = %j", (value) => {
    expect(() => startRun({ ticket: "TK-1", branch: value as never })).toThrow(
      InvalidRunEventError,
    );
    expect(() => startRun({ ticket: "TK-1", pullRequest: value as never })).toThrow(
      InvalidRunEventError,
    );
  });

  it("accepte 0, null et absent, et reste sérialisable sans perte", () => {
    const run = startRun({ ticket: "TK-1", attempts: 0, reviewRounds: 2, branch: null });
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });
});

describe("branche déjà posée (incident 17)", () => {
  it("worktree_ready ne remplace pas une branche par une autre", () => {
    const run = runAt("leased", { branch: "koklo/tk-1" });
    expect(() =>
      applyEvent(run, { type: "worktree_ready", branch: "koklo/autre" }, LIMITS),
    ).toThrow(InvalidRunEventError);
  });

  it("worktree_ready avec la même branche passe", () => {
    const run = runAt("leased", { branch: "koklo/tk-1" });
    const step = applyEvent(run, { type: "worktree_ready", branch: "koklo/tk-1" }, LIMITS);
    expect(step.run.state).toBe("developing");
  });
});

describe("InvalidRunStateError ne répète pas une chaîne arbitraire", () => {
  it("borne la longueur de la valeur exposée", () => {
    const error = new InvalidRunStateError(`${SECRET}${"x".repeat(500)}`);
    expect(error.message.length).toBeLessThan(120);
    expect(String(error.value).length).toBeLessThanOrEqual(32);
  });

  it("n'expose pas un objet brut", () => {
    const error = new InvalidRunStateError({ secret: SECRET });
    expect(JSON.stringify(error)).not.toContain(SECRET);
    expect(error.message).not.toContain(SECRET);
  });
});

describe("maxReviewRounds = 0", () => {
  it("le premier refus de review bloque (review_exhausted)", () => {
    const limits = { ...LIMITS, maxReviewRounds: 0 };
    const step = applyEvent(runAt("reviewing"), event("verdict_request_changes"), limits);
    expect(step.run.state).toBe("blocked");
    expect(step.run.blocked?.cause).toBe("review_exhausted");
  });

  it("la relecture finale suit ci_green dès le premier tour", () => {
    const limits = { ...LIMITS, maxReviewRounds: 0 };
    const step = applyEvent(runAt("ci_wait"), event("ci_green"), limits);
    expect(step.run.lastReviewedAfterFix).toBe(true);
  });
});
