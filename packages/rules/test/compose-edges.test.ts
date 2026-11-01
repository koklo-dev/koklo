import { describe, expect, it } from "vitest";
import { resolveEffectiveRules } from "../src/index.ts";
import {
  FUTURE,
  input,
  layer,
  newRule,
  override,
  resolveOk,
  ruleIds,
  ruleOf,
  waiver,
} from "./compose-fixtures.ts";

describe("sortie gelée et sans alias (Green)", () => {
  it("la résolution est gelée en profondeur", () => {
    const r = resolveOk();
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.rules[0])).toBe(true);
    expect(Object.isFrozen(r.rules[0]?.enforcement)).toBe(true);
  });
  it("ne gèle pas les objets de l'appelant", () => {
    const args = input();
    resolveEffectiveRules(args);
    expect(Object.isFrozen(args.catalog.rules[0])).toBe(false);
  });
});

describe("désactivations et dérogations hors périmètre (Green)", () => {
  it("une désactivation visant un autre rôle n'est pas listée", () => {
    const layers = [layer("project", { override: [override("docs.only", { disabled: true })] })];
    expect(resolveOk({ layers }).disabled).toEqual([]);
    expect(resolveOk({ layers, role: "doc-writer" }).disabled).toHaveLength(1);
  });
  it("une désactivation garde son expiration et la première gagne", () => {
    const layers = [
      layer("group", { override: [override("node.esm", { disabled: true, expires: FUTURE })] }),
      layer("project", { override: [override("node.esm", { disabled: true })] }),
    ];
    expect(resolveOk({ layers }).disabled).toMatchObject([{ level: "group", expires: FUTURE }]);
  });
  it("plusieurs dérogations sur la même règle sont toutes tracées", () => {
    const layers = [
      layer("group", { waivers: [waiver("node.tests")] }),
      layer("project", { waivers: [waiver("node.tests", { file: "packages/**" })] }),
    ];
    const r = resolveOk({ layers });
    expect(r.waivers.map((w) => w.level)).toEqual(["group", "project"]);
    expect(ruleIds(r)).not.toContain("node.tests");
  });
});

describe("surcharges sans effet réel et ajouts (Green)", () => {
  it("une surcharge qui ne change rien n'ajoute pas de trace", () => {
    const layers = [
      layer("project", { override: [override("node.esm", { severity: "advisory" })] }),
    ];
    expect(ruleOf(resolveOk({ layers }), "node.esm")?.trace).toHaveLength(1);
  });
  it("une exclusion est cumulée sans doublon", () => {
    const layers = [
      layer("group", { override: [override("node.esm", { excludePaths: ["a/**"] })] }),
      layer("project", { override: [override("node.esm", { excludePaths: ["a/**", "b/**"] })] }),
    ];
    expect(ruleOf(resolveOk({ layers }), "node.esm")?.excludePaths).toEqual(["a/**", "b/**"]);
  });
  it("une règle peut se remplacer elle-même ; la cible inconnue est un conflit", () => {
    const self = layer("project", { add: [newRule("node.esm", { replaces: "node.esm" })] });
    expect(ruleOf(resolveOk({ layers: [self] }), "node.esm")?.origin).toBe("project");
    const unknown = layer("project", { add: [newRule("x.y", { replaces: "nope.nothing" })] });
    expect(resolveOk({ layers: [unknown] }).conflicts).toMatchObject([
      { ruleId: "nope.nothing", attempted: "replace", reason: "unknown-rule" },
    ]);
  });
  it("une couche sans auteur trace l'ajout et le verrou sans auteur", () => {
    const anonymous = { level: "organization", add: [newRule("x.y")], lock: ["x.y"] } as never;
    const r = resolveOk({ layers: [anonymous] });
    expect(ruleOf(r, "x.y")?.trace).toEqual([
      { kind: "added", level: "organization" },
      { kind: "locked", level: "organization" },
    ]);
  });
  it("now en date-heure invalide est refusé", () => {
    expect(resolveEffectiveRules(input({ now: "2026-11-01Tnoon" }))).toMatchObject({
      ok: false,
      error: { code: "resolve.invalid-now" },
    });
  });
});
