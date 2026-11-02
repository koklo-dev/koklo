import { describe, expect, it } from "vitest";
import {
  InvalidQuotaError,
  onQuotaHit,
  parseQuotaState,
  QUOTA_MAX_EPOCH_MS,
  QUOTA_MAX_SERIALIZED_CHARS,
  QUOTA_MIN_EPOCH_MS,
  type QuotaState,
  recordUsage,
  serializeQuotaState,
  startQuotaState,
} from "../src/index.ts";
import { BACKOFF, NOW, signal, stateAt, USAGE, usage } from "./quota-helpers.ts";

const built = (): QuotaState => {
  const hit = onQuotaHit(startQuotaState(), signal({ id: "s1" }), NOW, 0, BACKOFF);
  return recordUsage(hit, usage("u1"), NOW + 1, USAGE);
};
/** Etat valide littéral (indépendant de l'implémentation) : base des états forgés. */
const VALID = {
  status: "backoff",
  resumeAt: NOW + 60_000,
  consecutiveHits: 1,
  lastHitAt: NOW,
  lastSignalId: "s1",
  windows: { "o:acme": { start: NOW, runs: 1, tokens: 100 } },
  usageIds: ["u1"],
  version: 2,
};
const valid = () => structuredClone(VALID) as Record<string, unknown>;
const text = (over: Record<string, unknown>) => JSON.stringify({ ...valid(), ...over });

describe("aller-retour", () => {
  it("parse(serialize(x)) est égal à x et gelé en profondeur", () => {
    const state = built();
    const back = parseQuotaState(serializeQuotaState(state));
    expect(back).toEqual(state);
    expect(Object.isFrozen(back)).toBe(true);
    expect(Object.isFrozen(back.windows)).toBe(true);
    expect(Object.isFrozen(back.usageIds)).toBe(true);
    for (const window of Object.values(back.windows)) expect(Object.isFrozen(window)).toBe(true);
  });

  it("aller-retour de l'état initial et d'un état épuisé", () => {
    for (const state of [
      startQuotaState(),
      stateAt({ status: "exhausted", consecutiveHits: 5, lastHitAt: NOW, version: 9 }),
    ]) {
      expect(parseQuotaState(serializeQuotaState(state))).toEqual(state);
    }
  });

  it("sérialisation stable : clés triées, indépendante de l'ordre de construction", () => {
    const a = stateAt({
      windows: {
        "p:a/b": { start: 0, runs: 1, tokens: 1 },
        "o:a": { start: 0, runs: 1, tokens: 1 },
      },
    });
    const b = stateAt({
      windows: {
        "o:a": { tokens: 1, runs: 1, start: 0 },
        "p:a/b": { runs: 1, start: 0, tokens: 1 },
      },
    });
    expect(serializeQuotaState(a)).toBe(serializeQuotaState(b));
    const keys = Object.keys(JSON.parse(serializeQuotaState(a)));
    expect(keys).toEqual([...keys].sort());
  });

  it("serialize refuse aussi un état forgé", () => {
    expect(() => serializeQuotaState(stateAt({ version: -1 }))).toThrow(InvalidQuotaError);
    expect(() => serializeQuotaState(null as never)).toThrow(InvalidQuotaError);
  });
});

const rejected: readonly (readonly [string, string])[] = [
  ["version négative", text({ version: -1 })],
  ["version fractionnaire", text({ version: 1.5 })],
  ["version texte", text({ version: "1" })],
  ["version absente", text({ version: undefined })],
  ["statut inconnu", text({ status: "paused" })],
  ["statut non texte", text({ status: 1 })],
  ["ok avec resumeAt", text({ status: "ok", resumeAt: NOW })],
  ["backoff sans resumeAt", text({ status: "backoff", resumeAt: null })],
  ["resumeAt texte", text({ resumeAt: "NaN" })],
  ["resumeAt Infinity", '{"status":"backoff","resumeAt":1e999}'],
  ["resumeAt négatif", text({ resumeAt: -5 })],
  ["resumeAt passé lointain", text({ resumeAt: QUOTA_MIN_EPOCH_MS - 1 })],
  ["resumeAt futur lointain", text({ resumeAt: QUOTA_MAX_EPOCH_MS + 1 })],
  ["resumeAt fractionnaire", text({ resumeAt: NOW + 0.5 })],
  ["consecutiveHits négatif", text({ consecutiveHits: -1 })],
  ["consecutiveHits fractionnaire", text({ consecutiveHits: 0.5 })],
  ["lastHitAt passé lointain", text({ lastHitAt: 1 })],
  ["lastSignalId non texte", text({ lastSignalId: 3 })],
  ["windows tableau", text({ windows: [] })],
  ["windows null", text({ windows: null })],
  ["clé de fenêtre inconnue", text({ windows: { "x:acme": { start: 0, runs: 0, tokens: 0 } } })],
  ["fenêtre runs négatif", text({ windows: { "o:a": { start: 0, runs: -1, tokens: 0 } } })],
  ["fenêtre tokens NaN", text({ windows: { "o:a": { start: 0, runs: 0, tokens: "x" } } })],
  ["fenêtre champ en trop", text({ windows: { "o:a": { start: 0, runs: 0, tokens: 0, x: 1 } } })],
  ["usageIds non tableau", text({ usageIds: "a" })],
  ["usageIds non texte", text({ usageIds: [1] })],
  ["usageIds démesuré", text({ usageIds: Array.from({ length: 1001 }, (_, i) => `u${i}`) })],
  ["clé inconnue", text({ extra: 1 })],
  ["constructor", text({ constructor: {} })],
  ["__proto__ racine", `{"__proto__":{"polluted":true},${JSON.stringify(valid()).slice(1)}`],
  [
    "__proto__ fenêtres",
    text({ windows: JSON.parse('{"__proto__":{"start":0,"runs":0,"tokens":0}}') }),
  ],
  ["racine tableau", "[]"],
  ["racine null", "null"],
  ["racine nombre", "42"],
  ["texte vide", ""],
  ["JSON invalide", "{"],
  ["NaN littéral", '{"status":"ok","version":NaN}'],
];

describe("rejet strict d'un état forgé", () => {
  it.each(rejected)("%s", (_name, input) => {
    expect(() => parseQuotaState(input)).toThrow(InvalidQuotaError);
  });

  it("n'accepte que du texte", () => {
    for (const value of [undefined, null, 42, {}, []]) {
      expect(() => parseQuotaState(value as unknown as string)).toThrow(InvalidQuotaError);
    }
  });

  it("refuse un texte supérieur à la borne, sans le parser", () => {
    const big = `{"status":"ok","pad":"${"a".repeat(QUOTA_MAX_SERIALIZED_CHARS)}"}`;
    expect(() => parseQuotaState(big)).toThrow(InvalidQuotaError);
  });

  it("ne pollue jamais Object.prototype, même en cas de refus", () => {
    expect(() => parseQuotaState('{"__proto__":{"polluted":true}}')).toThrow(InvalidQuotaError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("le message d'erreur ne contient pas le texte forgé", () => {
    const forged = text({ status: "SECRET-TOKEN-ghp_123" });
    expect(() => parseQuotaState(forged)).toThrow(InvalidQuotaError);
    expect(() => parseQuotaState(forged)).not.toThrow(/SECRET-TOKEN/);
  });
});
