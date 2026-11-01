import { describe, expect, it } from "vitest";
import {
  type Enforcement,
  type LayerLevel,
  type Override,
  resolveEffectiveRules,
} from "../src/index.ts";
import { isLockedSafe } from "../src/strength.ts";
import { layer, override, ruleOf } from "./compose-fixtures.ts";
import { resolveStrict, strictInput } from "./koklo-strict-fixtures.ts";

const LEVELS: readonly LayerLevel[] = ["organization", "group", "project"];
const FN = "strict.fn-lines";
const FN_RULE = "complexity/noExcessiveLinesPerFunction";
const gate = (extra: Record<string, unknown>): Enforcement =>
  ({ kind: "gate", adapter: "biome", ...extra }) as Enforcement;
const fnGate = (params: Record<string, number | string | boolean>, extra = {}): Enforcement =>
  gate({ params: { rule: FN_RULE, ...params }, ...extra });

interface Case {
  readonly name: string;
  readonly id: string;
  readonly enforcement: Enforcement;
}

const refused: readonly Case[] = [
  { name: "swap d'adapter", id: FN, enforcement: fnGate({ max: 50 }, { adapter: "noop" }) },
  {
    name: "level error -> off",
    id: "strict.no-explicit-any",
    enforcement: gate({ params: { rule: "suspicious/noExplicitAny", level: "off" } }),
  },
  {
    name: "params.rule changé",
    id: "strict.cognitive-complexity",
    enforcement: gate({ params: { rule: "x/none", max: 15 } }),
  },
  {
    name: "command ajoutée",
    id: "strict.conventional-commits",
    enforcement: { kind: "gate", adapter: "commitlint", command: "true" },
  },
  {
    name: "command changée",
    id: FN,
    enforcement: fnGate({ max: 50 }, { command: "echo ok" }),
  },
  {
    name: "scope source -> nothing",
    id: "strict.file-size-source",
    enforcement: { kind: "gate", adapter: "check-size", params: { max: 300, scope: "nothing" } },
  },
  { name: "max négatif", id: FN, enforcement: fnGate({ max: -5 }) },
  { name: "max non entier", id: FN, enforcement: fnGate({ max: 10.5 }) },
  { name: "max relevé", id: FN, enforcement: fnGate({ max: 80 }) },
  { name: "max retiré", id: FN, enforcement: fnGate({}) },
  { name: "max en texte", id: FN, enforcement: fnGate({ max: "10" }) },
  { name: "param ajouté", id: FN, enforcement: fnGate({ max: 40, extra: true }) },
  {
    name: "param non-max retiré",
    id: "strict.file-size-source",
    enforcement: { kind: "gate", adapter: "check-size", params: { max: 300 } },
  },
  {
    name: "params entièrement retirés",
    id: "strict.no-explicit-any",
    enforcement: { kind: "gate", adapter: "biome" },
  },
  {
    name: "max ajouté là où il n'existe pas",
    id: "strict.conventional-commits",
    enforcement: { kind: "gate", adapter: "commitlint", params: { max: 1 } },
  },
  {
    name: "max-params : kind gate",
    id: "strict.max-params",
    enforcement: { kind: "gate", adapter: "noop", params: { max: 4 } },
  },
  {
    name: "max-params : max retiré",
    id: "strict.max-params",
    enforcement: { kind: "instruction" },
  },
];

describe("une règle verrouillée n'accepte qu'un enforcement équivalent ou durci (B1)", () => {
  const matrix = refused.flatMap((c) => LEVELS.map((level) => ({ c, level })));
  it.each(matrix.map((m) => [`${m.c.id} | ${m.level} | ${m.c.name}`, m] as const))(
    "%s : conflit `locked`, règle inchangée",
    (_label, { c, level }) => {
      const profiled = layer(level, { profiles: ["koklo-strict"] });
      const before = ruleOf(resolveStrict({ layers: [profiled] }), c.id);
      const attacked = layer(level, {
        profiles: ["koklo-strict"],
        override: [override(c.id, { enforcement: c.enforcement })],
      });
      const result = resolveEffectiveRules(strictInput({ layers: [attacked] }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conflicts).toContainEqual(
        expect.objectContaining({ ruleId: c.id, attempted: "enforcement", reason: "locked" }),
      );
      expect(ruleOf(result.value, c.id)).toEqual(before);
    },
  );

  it("rejet en bloc : le reste de la surcharge ne s'applique pas, les autres surcharges si", () => {
    const bad: Override = override(FN, {
      enforcement: fnGate({ max: 50 }, { adapter: "noop" }),
      severity: "advisory",
    });
    const fine = override("strict.thin-controllers", { severity: "advisory" });
    const r = resolveStrict({
      layers: [layer("project", { profiles: ["koklo-strict"], override: [bad, fine] })],
    });
    expect(ruleOf(r, FN)?.severity).toBe("blocking");
    expect(ruleOf(r, "strict.thin-controllers")?.severity).toBe("advisory");
  });
});

describe("durcir ou répéter à l'identique reste permis", () => {
  it.each([
    ["max abaissé", fnGate({ max: 40 }), true],
    ["max à 0", fnGate({ max: 0 }), true],
    ["identique", fnGate({ max: 50 }), false],
  ])("%s", (_name, enforcement, hardened) => {
    const r = resolveStrict({
      layers: [
        layer("project", {
          profiles: ["koklo-strict"],
          override: [override(FN, { enforcement })],
        }),
      ],
    });
    expect(r.conflicts).toEqual([]);
    expect(ruleOf(r, FN)?.enforcement).toEqual(enforcement);
    if (hardened) expect(ruleOf(r, FN)?.trace.at(-1)?.kind).toBe("hardened");
  });
});

describe("une règle non verrouillée garde sa liberté d'enforcement de même force", () => {
  it("strict.no-dead-code-or-orphan-todo : changer d'adapter n'est pas un conflit", () => {
    const id = "strict.no-dead-code-or-orphan-todo";
    const r = resolveStrict({
      layers: [
        layer("project", {
          profiles: ["koklo-strict"],
          override: [override(id, { enforcement: { kind: "gate", adapter: "other" } })],
        }),
      ],
    });
    expect(r.conflicts).toEqual([]);
    expect(ruleOf(r, id)?.enforcement).toEqual({ kind: "gate", adapter: "other" });
  });
});

describe("max NaN / infini", () => {
  it("jamais accepté par isLockedSafe", () => {
    const from = fnGate({ max: 50 });
    expect(isLockedSafe(from, fnGate({ max: Number.NaN }))).toBe(false);
    expect(isLockedSafe(from, fnGate({ max: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(isLockedSafe(from, fnGate({ max: 49 }))).toBe(true);
  });

  it("une couche portant NaN est refusée ou rejetée, la règle ne change pas", () => {
    const result = resolveEffectiveRules(
      strictInput({
        layers: [
          layer("project", {
            profiles: ["koklo-strict"],
            override: [override(FN, { enforcement: fnGate({ max: Number.NaN }) })],
          }),
        ],
      }),
    );
    if (result.ok) expect(ruleOf(result.value, FN)?.enforcement).toEqual(fnGate({ max: 50 }));
  });
});
