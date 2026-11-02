import { beforeEach, describe, expect, it } from "vitest";
import {
  canStart,
  InvalidQuotaError,
  nextAllowedAt,
  onQuotaHit,
  type QuotaState,
  quotaDecision,
  recordUsage,
  StaleQuotaError,
  startQuotaState,
} from "../src/index.ts";
import { deepFreeze } from "./helpers.ts";
import { BACKOFF, HOUR, NOW, OTHER_SCOPES, SCOPE, signal, USAGE, usage } from "./quota-helpers.ts";

const record = (state: QuotaState, id: string, at = NOW, over = {}) =>
  recordUsage(state, usage(id, over), at, USAGE);
const times = (count: number, state = startQuotaState(), at = NOW) =>
  Array.from({ length: count }).reduce<QuotaState>((acc, _, i) => record(acc, `u${i}`, at), state);

describe("fenêtres fixes alignées par organisation, projet et agent", () => {
  it("compte runs et tokens sous les clés o:, p:, a: de la fenêtre courante", () => {
    const state = record(startQuotaState(), "u1", NOW + 1234);
    expect(state.windows).toEqual({
      "o:acme": { start: NOW, runs: 1, tokens: 100 },
      "p:acme/app": { start: NOW, runs: 1, tokens: 100 },
      "a:acme/developer": { start: NOW, runs: 1, tokens: 100 },
    });
    expect(state.version).toBe(1);
  });

  it("n'ouvre que les niveaux présents dans le scope", () => {
    const state = record(startQuotaState(), "u1", NOW, { scope: { organization: "globex" } });
    expect(Object.keys(state.windows)).toEqual(["o:globex"]);
  });

  it("additionne dans la fenêtre, repart de zéro dans la suivante et purge l'échue", () => {
    const same = record(record(startQuotaState(), "u1", NOW), "u2", NOW + HOUR - 1);
    expect(same.windows["p:acme/app"]).toEqual({ start: NOW, runs: 2, tokens: 200 });
    const next = record(same, "u3", NOW + HOUR);
    expect(next.windows["p:acme/app"]).toEqual({ start: NOW + HOUR, runs: 1, tokens: 100 });
    const skipped = record(next, "u4", NOW + 5 * HOUR);
    expect(Object.values(skipped.windows).every((w) => w.start === NOW + 5 * HOUR)).toBe(true);
  });
});

describe("plafonds : le plus restrictif gagne, attente jusqu'à la fenêtre suivante", () => {
  it("plafond de projet atteint : bloqué pour ce projet seulement, jusqu'au début de la fenêtre suivante", () => {
    const state = times(2);
    expect(canStart(state, NOW + 10, SCOPE, USAGE)).toBe(false);
    expect(nextAllowedAt(state, NOW + 10, SCOPE, USAGE)).toBe(NOW + HOUR);
    expect(quotaDecision(state, NOW + 10, SCOPE, USAGE)).toEqual({
      action: "wait",
      until: NOW + HOUR,
    });
    expect(state.status).toBe("ok");
    const [otherProject, , otherOrg] = OTHER_SCOPES;
    expect(canStart(state, NOW + 10, otherProject as never, USAGE)).toBe(true);
    expect(canStart(state, NOW + 10, otherOrg as never, USAGE)).toBe(true);
    expect(canStart(state, NOW + HOUR - 1, SCOPE, USAGE)).toBe(false);
    expect(canStart(state, NOW + HOUR, SCOPE, USAGE)).toBe(true);
    expect(nextAllowedAt(state, NOW + HOUR, SCOPE, USAGE)).toBe(NOW + HOUR);
  });

  it("le plafond de tokens compte aussi", () => {
    const state = record(startQuotaState(), "u1", NOW, { tokens: 1000, runs: 0 });
    expect(canStart(state, NOW, SCOPE, USAGE)).toBe(false);
    expect(
      canStart(record(startQuotaState(), "u1", NOW, { tokens: 999, runs: 0 }), NOW, SCOPE, USAGE),
    ).toBe(true);
  });
});

describe("plafonds : niveaux et cumul avec le recul", () => {
  it("le plafond le plus restrictif de organisation, projet et agent s'applique", () => {
    const org = {
      ...USAGE,
      organization: { maxRuns: 1 },
      project: { maxRuns: 9 },
      agent: { maxRuns: 9 },
    };
    const agent = {
      ...USAGE,
      organization: { maxRuns: 9 },
      project: { maxRuns: 9 },
      agent: { maxRuns: 1 },
    };
    const one = record(startQuotaState(), "u1");
    expect(canStart(one, NOW, SCOPE, org)).toBe(false);
    expect(canStart(one, NOW, { organization: "acme", project: "zzz" }, org)).toBe(false);
    expect(canStart(one, NOW, SCOPE, agent)).toBe(false);
    expect(canStart(one, NOW, { ...SCOPE, agent: "reviewer" }, agent)).toBe(true);
    expect(canStart(one, NOW, SCOPE, { ...USAGE, project: { maxRuns: 2 } })).toBe(true);
  });

  it("un plafond à 0 bloque dès le début de la fenêtre ; sans politique, aucun plafond", () => {
    const zero = { ...USAGE, project: { maxRuns: 0 } };
    expect(canStart(startQuotaState(), NOW, SCOPE, zero)).toBe(false);
    expect(nextAllowedAt(startQuotaState(), NOW + 5, SCOPE, zero)).toBe(NOW + HOUR);
    expect(canStart(times(5), NOW, SCOPE)).toBe(true);
  });

  it("le recul et le plafond se cumulent : le plus tardif gagne ; exhausted reste humain", () => {
    const capped = times(2);
    const both = onQuotaHit(
      capped,
      signal({ id: "h", resetAt: NOW + 30 * 60_000 }),
      NOW,
      0,
      BACKOFF,
    );
    expect(nextAllowedAt(both, NOW + 1, SCOPE, USAGE)).toBe(NOW + HOUR);
    const later = onQuotaHit(
      capped,
      signal({ id: "h2", resetAt: NOW + 2 * HOUR }),
      NOW,
      0,
      BACKOFF,
    );
    expect(nextAllowedAt(later, NOW + 1, SCOPE, USAGE)).toBe(NOW + 2 * HOUR);
    const dead = onQuotaHit(capped, signal({ id: "h3", kind: "exhausted" }), NOW, 0, BACKOFF);
    expect(nextAllowedAt(dead, NOW + 1, SCOPE, USAGE)).toBeNull();
  });
});

describe("dédoublonnage par id, liste bornée (D8)", () => {
  it("rejouer le même id ne compte pas deux fois", () => {
    const once = record(startQuotaState(), "same");
    const twice = record(once, "same");
    expect(twice).toEqual(once);
    expect(twice.version).toBe(once.version);
    expect(twice.windows["o:acme"]?.runs).toBe(1);
  });

  it("garde au plus maxSeenIds ids, du plus récent au plus ancien évincé", () => {
    let state = startQuotaState();
    for (const id of ["a", "b", "c", "d"])
      state = record(state, id, NOW, { scope: { organization: "x" } });
    expect(state.usageIds).toEqual(["b", "c", "d"]);
    expect(record(state, "b", NOW, { scope: { organization: "x" } })).toEqual(state);
    expect(record(state, "a", NOW, { scope: { organization: "x" } }).windows["o:x"]?.runs).toBe(5);
  });

  it("expectedVersion périmée -> StaleQuotaError (sauf rejeu)", () => {
    const state = record(startQuotaState(), "a");
    expect(() => recordUsage(state, usage("b"), NOW, USAGE, { expectedVersion: 0 })).toThrow(
      StaleQuotaError,
    );
    expect(() => recordUsage(state, usage("b"), NOW, USAGE, { expectedVersion: 1 })).not.toThrow();
    expect(() => recordUsage(state, usage("a"), NOW, USAGE, { expectedVersion: 0 })).not.toThrow();
  });

  it("ne mute pas l'entrée, renvoie une valeur gelée", () => {
    const frozen = deepFreeze(record(startQuotaState(), "a"));
    const next = record(frozen, "b");
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.windows["o:acme"])).toBe(true);
    expect(frozen.windows["o:acme"]?.runs).toBe(1);
  });
});

describe("bornes et validation", () => {
  let start: QuotaState;
  beforeEach(() => {
    start = startQuotaState();
  });
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2, "1", null])(
    "runs et tokens invalides : %j",
    (value) => {
      expect(() => record(start, "a", NOW, { runs: value })).toThrow(InvalidQuotaError);
      expect(() => record(start, "a", NOW, { tokens: value })).toThrow(InvalidQuotaError);
    },
  );

  it("refuse un dépassement de compteur au-delà de l'entier sûr", () => {
    const near = record(start, "a", NOW, { runs: Number.MAX_SAFE_INTEGER });
    expect(() => record(near, "b", NOW, { runs: 1 })).toThrow(InvalidQuotaError);
  });

  it.each([
    ["id vide", { id: "" }],
    ["id non texte", { id: 3 }],
    ["scope absent", { scope: undefined }],
    ["organisation vide", { scope: { organization: "" } }],
    ["projet vide", { scope: { organization: "a", project: "" } }],
    ["agent non texte", { scope: { organization: "a", agent: 4 } }],
  ])("usage invalide : %s", (_n, over) => {
    expect(() => record(start, "a", NOW, over)).toThrow(InvalidQuotaError);
  });

  it.each([-1, 1.5, Number.NaN, "1", null])("now invalide %j", (now) => {
    expect(() => record(start, "a", now as number)).toThrow(InvalidQuotaError);
  });

  it.each([
    ["windowMs nul", { windowMs: 0 }],
    ["windowMs négatif", { windowMs: -HOUR }],
    ["windowMs fractionnaire", { windowMs: 0.5 }],
    ["maxSeenIds nul", { maxSeenIds: 0 }],
    ["maxSeenIds démesuré", { maxSeenIds: 1_000_000 }],
    ["plafond négatif", { project: { maxRuns: -1 } }],
    ["plafond NaN", { agent: { maxTokens: Number.NaN } }],
  ])("politique invalide : %s", (_n, over) => {
    expect(() => recordUsage(start, usage("a"), NOW, { ...USAGE, ...over })).toThrow(
      InvalidQuotaError,
    );
    expect(() => canStart(start, NOW, SCOPE, { ...USAGE, ...over })).toThrow(InvalidQuotaError);
  });

  it("canStart, nextAllowedAt et quotaDecision valident aussi scope et now", () => {
    expect(() => canStart(start, -1, SCOPE)).toThrow(InvalidQuotaError);
    expect(() => nextAllowedAt(start, NOW, { organization: "" })).toThrow(InvalidQuotaError);
    expect(() => quotaDecision(start, Number.NaN, SCOPE)).toThrow(InvalidQuotaError);
  });
});
