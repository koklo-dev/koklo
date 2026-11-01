import { describe, expect, it } from "vitest";
import {
  type Enforcement,
  type LayerLevel,
  type RuleLayer,
  resolveEffectiveRules,
} from "../src/index.ts";
import { FUTURE, layer, override, ruleOf, SRC_FILE, waiver } from "./compose-fixtures.ts";
import {
  LOCKED_STRICT_IDS,
  resolveStrict,
  strictInput,
  strictSnapshot,
} from "./koklo-strict-fixtures.ts";

const LEVELS: readonly LayerLevel[] = ["organization", "group", "project"];
const FREE_IDS = strictSnapshot.map((r) => r.id).filter((id) => !LOCKED_STRICT_IDS.includes(id));
const profileOn = (level: LayerLevel, extra: Partial<RuleLayer> = {}): RuleLayer[] => [
  layer(level, { profiles: ["koklo-strict"], ...extra }),
];
const weaken: Enforcement = { kind: "instruction" };

const attempts: readonly {
  readonly name: string;
  readonly attempted: string;
  readonly build: (id: string) => Partial<RuleLayer>;
}[] = [
  {
    name: "désactiver",
    attempted: "disable",
    build: (id) => ({ override: [override(id, { disabled: true })] }),
  },
  {
    name: "passer en advisory",
    attempted: "severity",
    build: (id) => ({ override: [override(id, { severity: "advisory" })] }),
  },
  {
    name: "retirer l'agent",
    attempted: "agents",
    build: (id) => ({ override: [override(id, { agents: ["developer"] })] }),
  },
  {
    name: "déverrouiller",
    attempted: "unlock",
    build: (id) => ({ override: [override(id, { protected: false })] }),
  },
  { name: "dérogation fichier", attempted: "waiver", build: (id) => ({ waivers: [waiver(id)] }) },
];

describe("a lower level cannot weaken a locked strict rule (D3)", () => {
  const matrix = LOCKED_STRICT_IDS.flatMap((id) =>
    LEVELS.flatMap((level) => attempts.map((a) => ({ id, level, a }))),
  );

  it.each(matrix.map((m) => [`${m.id} | ${m.level} | ${m.a.name}`, m] as const))(
    "%s : conflit `locked`, règle inchangée",
    (_label, { id, level, a }) => {
      const before = ruleOf(resolveStrict({ layers: profileOn(level) }), id);
      const result = resolveEffectiveRules(strictInput({ layers: profileOn(level, a.build(id)) }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conflicts).toContainEqual(
        expect.objectContaining({ ruleId: id, attempted: a.attempted, reason: "locked" }),
      );
      expect(ruleOf(result.value, id)).toEqual(before);
      expect(ruleOf(result.value, id)?.locked).toBe(true);
    },
  );
});

const limitCases: readonly [string, Enforcement, string][] = [
  [
    "strict.fn-lines",
    {
      kind: "gate",
      adapter: "biome",
      params: { rule: "complexity/noExcessiveLinesPerFunction", max: 80 },
    },
    "enforcement",
  ],
  [
    "strict.cognitive-complexity",
    {
      kind: "gate",
      adapter: "biome",
      params: { rule: "complexity/noExcessiveCognitiveComplexity", max: 30 },
    },
    "enforcement",
  ],
  [
    "strict.file-size-source",
    { kind: "gate", adapter: "check-size", params: { max: 1000, scope: "source" } },
    "enforcement",
  ],
  [
    "strict.file-size-test",
    { kind: "gate", adapter: "check-size", params: { scope: "test" } },
    "enforcement",
  ],
  ["strict.max-params", { kind: "instruction", params: { max: 8 } }, "enforcement"],
  ["strict.fn-lines", weaken, "enforcement"],
  ["strict.domain-purity", weaken, "enforcement"],
  ["strict.conventional-commits", { kind: "evidence", evidence: "x" }, "enforcement"],
];

describe("les limites chiffrées ne se desserrent pas par un niveau inférieur", () => {
  it.each(limitCases.map((c) => [`${c[0]} -> ${JSON.stringify(c[1])}`, c] as const))(
    "%s",
    (_label, [id, enforcement, attempted]) => {
      const before = ruleOf(resolveStrict({ layers: profileOn("project") }), id);
      const result = resolveEffectiveRules(
        strictInput({
          layers: profileOn("project", { override: [override(id, { enforcement })] }),
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conflicts).toContainEqual(
        expect.objectContaining({ ruleId: id, attempted, reason: "locked" }),
      );
      expect(ruleOf(result.value, id)).toEqual(before);
    },
  );
});

describe("durcir une limite chiffrée", () => {
  it("reste permis et tracé (50 -> 40)", () => {
    const tighter: Enforcement = {
      kind: "gate",
      adapter: "biome",
      params: { rule: "complexity/noExcessiveLinesPerFunction", max: 40 },
    };
    const result = resolveEffectiveRules(
      strictInput({
        layers: profileOn("project", {
          override: [override("strict.fn-lines", { enforcement: tighter })],
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.conflicts).toEqual([]);
    const rule = ruleOf(result.value, "strict.fn-lines");
    expect(rule?.enforcement).toEqual(tighter);
    expect(rule?.trace.map((t) => t.kind)).toContain("hardened");
  });
});

describe("règles strict non verrouillées : dérogations et surcharges tracées", () => {
  it.each(FREE_IDS.map((id) => [id] as const))("%s : surcharge advisory tracée", (id) => {
    const result = resolveEffectiveRules(
      strictInput({
        layers: profileOn("project", { override: [override(id, { severity: "advisory" })] }),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.conflicts).toEqual([]);
    const rule = ruleOf(result.value, id);
    if (rule?.severity !== "advisory") return; // déjà advisory : rien de plus faible
    expect(rule.trace.at(-1)).toMatchObject({
      kind: "overridden",
      level: "project",
      author: "jane.doe",
    });
  });

  it("une dérogation valide sur strict.no-dead-code-or-orphan-todo retire la règle pour ce fichier", () => {
    const id = "strict.no-dead-code-or-orphan-todo";
    const r = resolveStrict({
      layers: profileOn("project", { waivers: [waiver(id)] }),
    });
    expect(ruleOf(r, id)).toBeUndefined();
    expect(r.waivers).toEqual([
      expect.objectContaining({ ruleId: id, file: SRC_FILE, expires: FUTURE, level: "project" }),
    ]);
    expect(r.conflicts).toEqual([]);
  });

  it("la même dérogation sur un autre fichier laisse la règle en place", () => {
    const id = "strict.typed-errors";
    const r = resolveStrict({
      layers: profileOn("project", { waivers: [waiver(id, { file: "packages/other/x.ts" })] }),
    });
    expect(ruleOf(r, id)).toBeDefined();
    expect(r.waivers).toEqual([]);
  });

  it("une dérogation expirée est ignorée et signalée", () => {
    const id = "strict.structured-logs";
    const r = resolveStrict({
      layers: profileOn("project", { waivers: [waiver(id, { expires: "2026-01-15" })] }),
    });
    expect(ruleOf(r, id)).toBeDefined();
    expect(r.conflicts).toContainEqual(
      expect.objectContaining({ ruleId: id, attempted: "waiver", reason: "expired" }),
    );
  });

  it("désactiver une règle libre est tracé dans `disabled` (auteur, justification)", () => {
    const id = "strict.english-code-french-ui";
    const r = resolveStrict({
      layers: profileOn("project", { override: [override(id, { disabled: true })] }),
    });
    expect(ruleOf(r, id)).toBeUndefined();
    expect(r.disabled).toEqual([
      expect.objectContaining({ ruleId: id, level: "project", author: "jane.doe" }),
    ]);
  });
});

describe("le verrou d'un niveau supérieur sur une règle libre ne se lève pas", () => {
  it("l'organisation verrouille strict.thin-controllers : le projet ne peut pas la désactiver", () => {
    const id = "strict.thin-controllers";
    const r = resolveStrict({
      layers: [
        layer("organization", { profiles: ["koklo-strict"], lock: [id] }),
        layer("project", { override: [override(id, { disabled: true })] }),
      ],
    });
    expect(ruleOf(r, id)).toBeDefined();
    expect(r.conflicts).toContainEqual(
      expect.objectContaining({ ruleId: id, attempted: "disable", reason: "locked" }),
    );
  });
});
