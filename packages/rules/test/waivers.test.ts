import { describe, expect, it } from "vitest";
import { resolveEffectiveRules } from "../src/index.ts";
import {
  AUTHOR,
  FUTURE,
  input,
  layer,
  NOW,
  PAST,
  resolveOk,
  ruleIds,
  ruleOf,
  SRC_FILE,
  WHY,
  waiver,
} from "./compose-fixtures.ts";

const withWaiver = (w = waiver("node.tests"), extra = {}) =>
  resolveOk({ layers: [layer("project", { waivers: [w] })], ...extra });

describe("dérogations tracées", () => {
  it("valide (auteur, justification, expiration future) : règle retirée pour ce fichier, tracée", () => {
    const r = withWaiver();
    expect(ruleIds(r)).not.toContain("node.tests");
    expect(r.conflicts).toEqual([]);
    expect(r.waivers).toEqual([
      {
        ruleId: "node.tests",
        file: SRC_FILE,
        author: AUTHOR,
        justification: WHY,
        expires: FUTURE,
        level: "project",
      },
    ]);
  });
  it("ne vaut que pour son fichier : ailleurs la règle reste et la dérogation n'est pas listée", () => {
    const r = withWaiver(waiver("node.tests"), { path: "packages/api/src/b.ts" });
    expect(ruleIds(r)).toContain("node.tests");
    expect(r.waivers).toEqual([]);
  });
  it("ne touche pas les autres règles", () => {
    expect(ruleIds(withWaiver())).toEqual(["global.scope", "global.secrets", "node.esm"]);
  });
  it("borne incluse : expire le jour de now = encore valide", () => {
    expect(ruleIds(withWaiver(waiver("node.tests", { expires: NOW })))).not.toContain("node.tests");
  });
  it("accepte now en date-heure ISO (jour comparé)", () => {
    const r = withWaiver(waiver("node.tests", { expires: NOW }), { now: `${NOW}T23:59:59Z` });
    expect(ruleIds(r)).not.toContain("node.tests");
  });
});

describe("dérogations tracées : expiration et refus", () => {
  it("expirée : ignorée (la règle reste) + conflit 'expired'", () => {
    const r = withWaiver(waiver("node.tests", { expires: PAST }));
    expect(ruleOf(r, "node.tests")).toEqual(ruleOf(resolveOk(), "node.tests"));
    expect(r.waivers).toEqual([]);
    expect(r.conflicts).toEqual([
      { ruleId: "node.tests", level: "project", attempted: "waiver", reason: "expired" },
    ]);
  });
  it("expirée la veille de now, valide le jour même : dépend de `now` seulement", () => {
    const w = waiver("node.tests", { expires: "2026-10-31" });
    expect(ruleIds(withWaiver(w, { now: "2026-10-31" }))).not.toContain("node.tests");
    expect(ruleIds(withWaiver(w, { now: "2026-11-01" }))).toContain("node.tests");
  });
  it("sur règle inconnue : conflit unknown-rule", () => {
    const r = withWaiver(waiver("nope.nothing"));
    expect(r.conflicts).toEqual([
      { ruleId: "nope.nothing", level: "project", attempted: "waiver", reason: "unknown-rule" },
    ]);
  });
  it("sur règle verrouillée : conflit locked, règle inchangée", () => {
    const r = withWaiver(waiver("global.secrets"));
    expect(r.conflicts).toEqual([
      { ruleId: "global.secrets", level: "project", attempted: "waiver", reason: "locked" },
    ]);
    expect(ruleOf(r, "global.secrets")).toEqual(ruleOf(resolveOk(), "global.secrets"));
  });
  it("sans `expires` : refusée (waiver.missing-expires), jamais appliquée", () => {
    const { expires: _expires, ...bare } = waiver("node.tests");
    const r = resolveEffectiveRules(
      input({ layers: [layer("project", { waivers: [bare as never] })] }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "waiver.missing-expires" } });
  });
  it("`expires` mal formée : refusée (waiver.invalid-expires)", () => {
    const bad = waiver("node.tests", { expires: "dans 3 mois" });
    const r = resolveEffectiveRules(input({ layers: [layer("project", { waivers: [bad] })] }));
    expect(r).toMatchObject({ ok: false, error: { code: "waiver.invalid-expires" } });
  });
});
