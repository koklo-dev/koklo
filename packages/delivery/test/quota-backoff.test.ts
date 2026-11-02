import { beforeEach, describe, expect, it } from "vitest";
import {
  clearQuota,
  InvalidQuotaError,
  nextAllowedAt,
  onQuotaHit,
  type QuotaState,
  quotaDecision,
  recordUsage,
  resolveResetAt,
  StaleQuotaError,
  startQuotaState,
} from "../src/index.ts";
import { deepFreeze } from "./helpers.ts";
import { BACKOFF, HOUR, MINUTE, NOW, SCOPE, signal, USAGE, usage } from "./quota-helpers.ts";

const hit = (state: QuotaState, id: string, at: number, jitter = 0, over = {}) =>
  onQuotaHit(state, signal({ id, ...over }), at, jitter, BACKOFF);

describe("état initial", () => {
  it("est ok, version 0, gelé", () => {
    const state = startQuotaState();
    expect(state).toMatchObject({
      status: "ok",
      resumeAt: null,
      consecutiveHits: 0,
      lastHitAt: null,
      lastSignalId: null,
      windows: {},
      usageIds: [],
      version: 0,
    });
    expect(Object.isFrozen(state)).toBe(true);
  });
});

describe("recul exponentiel plafonné, gigue injectée", () => {
  it("double à chaque frappe consécutive après la reprise, puis plafonne", () => {
    let state = startQuotaState();
    let at = NOW;
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = hit(state, `h${i}`, at);
      delays.push((state.resumeAt as number) - at);
      at = state.resumeAt as number;
    }
    expect(delays).toEqual([MINUTE, 2 * MINUTE, 4 * MINUTE, 8 * MINUTE]);
    expect(state.consecutiveHits).toBe(4);

    const capped = onQuotaHit(startQuotaState(), signal({ id: "x" }), NOW, 0, {
      ...BACKOFF,
      baseMs: 5 * HOUR,
      maxDelayMs: 6 * HOUR,
    });
    expect(capped.resumeAt).toBe(NOW + 5 * HOUR);
    const again = onQuotaHit(
      { ...capped, consecutiveHits: 2 },
      signal({ id: "y" }),
      capped.resumeAt as number,
      0,
      { ...BACKOFF, baseMs: 5 * HOUR, maxDelayMs: 6 * HOUR },
    );
    expect((again.resumeAt as number) - (capped.resumeAt as number)).toBe(6 * HOUR);
  });

  it("la gigue est une fonction pure du paramètre (aux bornes comme au milieu)", () => {
    const at = (jitter: number) => hit(startQuotaState(), "j", NOW, jitter).resumeAt;
    expect(at(0)).toBe(NOW + MINUTE);
    expect(at(0.5)).toBe(NOW + Math.floor(MINUTE * (1 + 0.5 * BACKOFF.jitterRatio)));
    expect(at(0.5)).toBe(at(0.5));
    expect(at(0.999999) as number).toBeLessThan(NOW + MINUTE * (1 + BACKOFF.jitterRatio));
    expect(at(0.999999) as number).toBeGreaterThan(at(0.5) as number);
  });

  it.each([-0.1, 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "0.5", null, undefined])(
    "rejette une gigue hors de [0,1) : %j",
    (jitter) => {
      expect(() => hit(startQuotaState(), "j", NOW, jitter as number)).toThrow(InvalidQuotaError);
    },
  );
});

describe("date de reprise du fournisseur", () => {
  it("utilise resetAt, retry-after ou l'heure murale + décalage (priorité dans cet ordre)", () => {
    const base = startQuotaState();
    expect(hit(base, "a", NOW, 0, { resetAt: NOW + 600_000 }).resumeAt).toBe(NOW + 600_000);
    expect(hit(base, "b", NOW, 0, { retryAfterMs: 30_000 }).resumeAt).toBe(NOW + 30_000);
    const clock = { hour: 15, minute: 0, zone: null };
    expect(hit(base, "c", NOW, 0, { resetHint: clock }).resumeAt).toBe(NOW + 7 * HOUR);
    const paris = onQuotaHit(base, signal({ id: "d", resetHint: clock }), NOW, 0, {
      ...BACKOFF,
      utcOffsetMinutes: 120,
    });
    expect(paris.resumeAt).toBe(NOW + 5 * HOUR);
    expect(
      hit(base, "e", NOW, 0, { resetAt: NOW + 2 * HOUR, retryAfterMs: 1, resetHint: clock })
        .resumeAt,
    ).toBe(NOW + 2 * HOUR);
  });

  it("borne la date du fournisseur par maxDelayMs", () => {
    expect(hit(startQuotaState(), "a", NOW, 0, { resetAt: NOW + 100 * HOUR }).resumeAt).toBe(
      NOW + BACKOFF.maxDelayMs,
    );
  });

  it("repli exponentiel : date passée, fuseau nommé sans décalage, décalage non fourni", () => {
    const zone = { hour: 15, minute: 0, zone: "Europe/Paris" };
    expect(hit(startQuotaState(), "a", NOW, 0, { resetAt: NOW - HOUR }).resumeAt).toBe(
      NOW + MINUTE,
    );
    expect(hit(startQuotaState(), "b", NOW, 0, { resetHint: zone }).resumeAt).toBe(NOW + MINUTE);
    const noOffset = onQuotaHit(
      startQuotaState(),
      signal({ id: "c", resetHint: { hour: 15, minute: 0, zone: null } }),
      NOW,
      0,
      { ...BACKOFF, utcOffsetMinutes: null },
    );
    expect(noOffset.resumeAt).toBe(NOW + MINUTE);
  });
});

describe("resolveResetAt : arithmétique entière, sans Date ni Intl", () => {
  const clock = (hour: number, minute = 0) => signal({ resetHint: { hour, minute, zone: null } });

  it("prochaine occurrence strictement future de l'heure murale", () => {
    expect(resolveResetAt(clock(15), NOW, 0)).toBe(NOW + 7 * HOUR);
    expect(resolveResetAt(clock(15, 30), NOW, 0)).toBe(NOW + 7 * HOUR + 30 * MINUTE);
    expect(resolveResetAt(clock(7), NOW, 0)).toBe(NOW + 23 * HOUR);
    expect(resolveResetAt(clock(8), NOW, 0)).toBe(NOW + 24 * HOUR);
    expect(resolveResetAt(clock(15), NOW, -300)).toBe(NOW + 12 * HOUR);
    expect(resolveResetAt(clock(15), NOW, 120)).toBe(NOW + 5 * HOUR);
  });

  it("résout aussi à travers minuit et sur un instant négatif", () => {
    expect(resolveResetAt(clock(1), NOW + 20 * HOUR, 0)).toBe(NOW + 25 * HOUR);
    expect(resolveResetAt(clock(0), -HOUR, 0)).toBe(0);
  });

  it("ignore un indice absent ou un fuseau nommé (repli exponentiel)", () => {
    expect(resolveResetAt(signal(), NOW, 0)).toBeNull();
    expect(
      resolveResetAt(signal({ resetHint: { hour: 3, minute: 0, zone: "UTC" } }), NOW, 0),
    ).toBeNull();
    expect(resolveResetAt(clock(15), NOW, null)).toBeNull();
  });

  it("préfère resetAt, puis retryAfterMs", () => {
    expect(resolveResetAt(signal({ resetAt: NOW + 5 }), NOW, 0)).toBe(NOW + 5);
    expect(resolveResetAt(signal({ retryAfterMs: 5 }), NOW, 0)).toBe(NOW + 5);
  });

  it.each([
    ["heure 24", signal({ resetHint: { hour: 24, minute: 0, zone: null } }), 0],
    ["minute 60", signal({ resetHint: { hour: 1, minute: 60, zone: null } }), 0],
    ["heure fractionnaire", signal({ resetHint: { hour: 1.5, minute: 0, zone: null } }), 0],
    ["décalage hors limites", signal({ resetHint: { hour: 1, minute: 0, zone: null } }), 24 * 60],
    ["décalage fractionnaire", signal({ resetHint: { hour: 1, minute: 0, zone: null } }), 0.5],
  ])("rejette %s", (_n, sig, offset) => {
    expect(() => resolveResetAt(sig, NOW, offset)).toThrow(InvalidQuotaError);
  });
});

describe("max de frappes consécutives et épuisement", () => {
  it("passe en exhausted au maxConsecutiveHits-ième palier : attente humaine", () => {
    let state = startQuotaState();
    for (let i = 0; i < BACKOFF.maxConsecutiveHits - 1; i++) {
      state = hit(state, `h${i}`, state.resumeAt ?? NOW);
      expect(state.status).toBe("backoff");
    }
    state = hit(state, "last", state.resumeAt as number);
    expect(state.status).toBe("exhausted");
    expect(state.resumeAt).toBeNull();
    expect(nextAllowedAt(state, NOW + 1000 * HOUR, SCOPE)).toBeNull();
    expect(quotaDecision(state, NOW + 1000 * HOUR, SCOPE)).toEqual({
      action: "halt",
      reason: "quota_exhausted",
    });
  });

  it("D4 : un signal exhausted (crédit épuisé) épuise tout de suite", () => {
    const state = hit(startQuotaState(), "c", NOW, 0, { kind: "exhausted" });
    expect(state.status).toBe("exhausted");
    expect(state.resumeAt).toBeNull();
    expect(quotaDecision(state, NOW + 10 * HOUR, SCOPE).action).toBe("halt");
  });

  it("D7 : unknown_limit recule comme une fenêtre (jamais d'escalade)", () => {
    const state = hit(startQuotaState(), "u", NOW, 0, { kind: "unknown_limit" });
    expect(state.status).toBe("backoff");
  });

  it("un état exhausted le reste tant qu'un humain ne l'a pas réarmé", () => {
    const exhausted = hit(startQuotaState(), "c", NOW, 0, { kind: "exhausted" });
    const later = hit(exhausted, "d", NOW + HOUR);
    expect(later.status).toBe("exhausted");
    const cleared = clearQuota(exhausted);
    expect(cleared).toMatchObject({ status: "ok", resumeAt: null, consecutiveHits: 0 });
    expect(cleared.version).toBe(exhausted.version + 1);
    expect(() => clearQuota(exhausted, { expectedVersion: 99 })).toThrow(StaleQuotaError);
  });
});

describe("reprise réussie", () => {
  it("un usage enregistré après resumeAt remet l'exponentielle à zéro", () => {
    const backoff = hit(hit(startQuotaState(), "a", NOW), "b", NOW + MINUTE);
    expect(backoff.consecutiveHits).toBe(2);
    const resumeAt = backoff.resumeAt as number;
    const early = recordUsage(backoff, usage("u1"), resumeAt - 1, USAGE);
    expect(early.consecutiveHits).toBe(2);
    expect(early.status).toBe("backoff");
    const ok = recordUsage(backoff, usage("u2"), resumeAt, USAGE);
    expect(ok).toMatchObject({ status: "ok", resumeAt: null, consecutiveHits: 0 });
    expect(hit(ok, "c", resumeAt + 1).resumeAt).toBe(resumeAt + 1 + MINUTE);
  });
});

describe("idempotence, version, concurrence optimiste", () => {
  it("rejouer le même signal (même id) ne change rien, même plus tard", () => {
    const first = hit(startQuotaState(), "dup", NOW);
    expect(hit(first, "dup", NOW)).toEqual(first);
    const later = hit(first, "dup", (first.resumeAt as number) + HOUR);
    expect(later).toEqual(first);
    expect(later.version).toBe(first.version);
    expect(later.consecutiveHits).toBe(1);
  });

  it("un vrai changement incrémente la version de 1 ; la rafale sans effet ne la touche pas", () => {
    const first = hit(startQuotaState(), "a", NOW, 0, { resetAt: NOW + HOUR });
    expect(first.version).toBe(1);
    const noEffect = hit(first, "b", NOW + 1, 0, { resetAt: NOW + MINUTE });
    expect(noEffect.version).toBe(1);
    expect(noEffect.resumeAt).toBe(first.resumeAt);
    const extended = hit(first, "c", NOW + 2, 0, { resetAt: NOW + 2 * HOUR });
    expect(extended.version).toBe(2);
    expect(extended.consecutiveHits).toBe(1);
  });

  it("expectedVersion périmée -> StaleQuotaError ; courante -> acceptée", () => {
    const first = hit(startQuotaState(), "a", NOW);
    const sig = signal({ id: "b" });
    expect(() => onQuotaHit(first, sig, NOW + 1, 0, BACKOFF, { expectedVersion: 0 })).toThrow(
      StaleQuotaError,
    );
    const stale = (() => {
      try {
        onQuotaHit(first, sig, NOW + 1, 0, BACKOFF, { expectedVersion: 0 });
      } catch (error) {
        return error as StaleQuotaError;
      }
    })();
    expect(stale).toMatchObject({ expectedVersion: 0, actualVersion: 1 });
    expect(() => onQuotaHit(first, sig, NOW + 1, 0, BACKOFF, { expectedVersion: 1 })).not.toThrow();
    expect(() => onQuotaHit(first, sig, NOW + 1, 0, BACKOFF, { expectedVersion: -1 })).toThrow(
      InvalidQuotaError,
    );
  });

  it("ne mute jamais l'entrée et renvoie une valeur gelée", () => {
    const frozen = deepFreeze(hit(startQuotaState(), "a", NOW));
    const next = hit(frozen, "b", (frozen.resumeAt as number) + 1);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.windows)).toBe(true);
    expect(Object.isFrozen(next.usageIds)).toBe(true);
  });
});

describe("validation des entrées", () => {
  let start: QuotaState;
  beforeEach(() => {
    start = startQuotaState();
  });
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null, undefined])(
    "now invalide %j",
    (now) => {
      expect(() => hit(start, "a", now as number)).toThrow(InvalidQuotaError);
    },
  );

  it.each([
    ["baseMs nul", { baseMs: 0 }],
    ["baseMs négatif", { baseMs: -1 }],
    ["maxDelay < base", { maxDelayMs: 1 }],
    ["jitterRatio négatif", { jitterRatio: -0.1 }],
    ["jitterRatio NaN", { jitterRatio: Number.NaN }],
    ["maxConsecutiveHits nul", { maxConsecutiveHits: 0 }],
    ["décalage hors limites", { utcOffsetMinutes: 5000 }],
    ["décalage fractionnaire", { utcOffsetMinutes: 0.5 }],
  ])("politique invalide : %s", (_n, over) => {
    expect(() => onQuotaHit(start, signal({ id: "a" }), NOW, 0, { ...BACKOFF, ...over })).toThrow(
      InvalidQuotaError,
    );
  });

  it.each([
    ["kind inconnu", { kind: "other" }],
    ["id vide", { id: "" }],
    ["resetAt négatif", { resetAt: -1 }],
    ["resetAt NaN", { resetAt: Number.NaN }],
    ["retryAfter négatif", { retryAfterMs: -5 }],
    ["raw non texte", { raw: 42 }],
  ])("signal invalide : %s", (_n, over) => {
    expect(() => hit(start, "a", NOW, 0, over)).toThrow(InvalidQuotaError);
  });

  it("signal absent ou politique absente", () => {
    expect(() => onQuotaHit(start, null as never, NOW, 0, BACKOFF)).toThrow(InvalidQuotaError);
    expect(() => onQuotaHit(start, signal(), NOW, 0, undefined as never)).toThrow(
      InvalidQuotaError,
    );
  });
});
