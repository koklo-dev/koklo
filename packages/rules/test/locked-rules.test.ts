import { describe, expect, it } from "vitest";
import {
  type AgentRole,
  type LayerLevel,
  type LayerRule,
  loadBuiltInCatalog,
  type Resolution,
  type Rule,
  type RuleLayer,
  resolveEffectiveRules,
} from "../src/index.ts";
import {
  input,
  layer,
  newRule,
  override,
  resolveOk,
  ruleIds,
  ruleOf,
  waiver,
} from "./compose-fixtures.ts";

const catalog = loadBuiltInCatalog();
const PATH = "packages/api/src/a.ts";
const LEVELS: readonly LayerLevel[] = ["organization", "group", "project"];
/** Les règles verrouillées du catalogue réel : les protégées (au minimum les 4 de Shipyard). */
const LOCKED = catalog.rules.filter((r) => r.protected);
const real = (extra: Parameters<typeof input>[0] = {}) =>
  input({
    catalog,
    path: PATH,
    profiles: ["security", "privacy-rgpd"],
    ...extra,
  });
const roleOf = (rule: Rule): AgentRole => rule.agents[0] as AgentRole;

interface Attempt {
  readonly name: string;
  /** `conflict` : résolution ok + Conflict(locked) ; `error` : résolution refusée. */
  readonly outcome: "conflict" | "error";
  readonly build: (rule: Rule, level: LayerLevel, role: AgentRole) => RuleLayer;
}

const attempts: readonly Attempt[] = [
  {
    name: "désactiver",
    outcome: "conflict",
    build: (r, l) => layer(l, { override: [override(r.id, { disabled: true })] }),
  },
  {
    name: "passer en advisory",
    outcome: "conflict",
    build: (r, l) => layer(l, { override: [override(r.id, { severity: "advisory" })] }),
  },
  {
    name: "enforcement plus faible",
    outcome: "conflict",
    build: (r, l) =>
      layer(l, { override: [override(r.id, { enforcement: { kind: "instruction" } })] }),
  },
  {
    name: "retirer un agent",
    outcome: "conflict",
    build: (r, l, role) =>
      layer(l, { override: [override(r.id, { agents: r.agents.filter((a) => a !== role) })] }),
  },
  {
    name: "élargir une exclusion de chemin",
    outcome: "conflict",
    build: (r, l) => layer(l, { override: [override(r.id, { excludePaths: ["**"] })] }),
  },
  {
    name: "déverrouiller (protected:false)",
    outcome: "conflict",
    build: (r, l) => layer(l, { override: [override(r.id, { protected: false })] }),
  },
  {
    name: "dérogation sur le fichier",
    outcome: "conflict",
    build: (r, l) => layer(l, { waivers: [waiver(r.id, { file: PATH })] }),
  },
  {
    name: "ré-ajout sous le même id",
    outcome: "conflict",
    build: (r, l) => layer(l, { add: [weak(r.id, {})] }),
  },
  {
    name: "ré-ajout sous un autre nom (replaces)",
    outcome: "conflict",
    build: (r, l) =>
      layer(l, { add: [weak(`custom.${r.id.replace(".", "-")}`, { replaces: r.id })] }),
  },
  {
    name: "couche sans droit (niveau catalog)",
    outcome: "error",
    build: (r) => layer("catalog" as never, { override: [override(r.id, { disabled: true })] }),
  },
];

function weak(id: string, extra: Partial<LayerRule>): LayerRule {
  return newRule(id, { severity: "advisory", protected: false, profiles: ["core"], ...extra });
}

const baseline = (rule: Rule): Resolution => {
  const r = resolveEffectiveRules(real({ role: roleOf(rule) }));
  if (!r.ok) throw new Error("baseline");
  return r.value;
};

describe("catalogue réel : règles verrouillées", () => {
  it("contient au moins les 4 protégées de Shipyard, effectives et verrouillées", () => {
    expect(LOCKED.map((r) => r.id).sort()).toEqual([
      "global.dependency-integrity",
      "global.secrets",
      "privacy.sensitive-logging",
      "security.authorization",
    ]);
    for (const rule of LOCKED) {
      expect(ruleOf(baseline(rule), rule.id)).toMatchObject({ locked: true, severity: "blocking" });
    }
  });
});

describe("a lower level cannot disable a locked rule", () => {
  const matrix = LOCKED.flatMap((rule) =>
    LEVELS.flatMap((level) => attempts.map((attempt) => ({ rule, level, attempt }))),
  );

  it.each(matrix.map((m) => [`${m.rule.id} | ${m.level} | ${m.attempt.name}`, m] as const))(
    "%s",
    (_label, { rule, level, attempt }) => {
      const role = roleOf(rule);
      const before = ruleOf(baseline(rule), rule.id);
      const result = resolveEffectiveRules(
        real({ role, layers: [attempt.build(rule, level, role)] }),
      );
      if (attempt.outcome === "error") {
        expect(result.ok).toBe(false);
        return;
      }
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conflicts).toContainEqual(
        expect.objectContaining({ ruleId: rule.id, level, reason: "locked" }),
      );
      expect(ruleOf(result.value, rule.id)).toEqual(before);
      expect(result.value.disabled.map((d) => d.ruleId)).not.toContain(rule.id);
      expect(result.value.waivers.map((w) => w.ruleId)).not.toContain(rule.id);
      expect(ruleIds(result.value)).not.toContain(`custom.${rule.id.replace(".", "-")}`);
    },
  );

  it("les trois niveaux qui attaquent ensemble : un conflit chacun, règle inchangée", () => {
    const rule = LOCKED[0] as Rule;
    const layers = LEVELS.map((l) =>
      layer(l, { override: [override(rule.id, { disabled: true })] }),
    );
    const r = resolveEffectiveRules(real({ role: roleOf(rule), layers }));
    expect(r.ok && r.value.conflicts.map((c) => c.level)).toEqual(LEVELS);
    expect(r.ok && ruleOf(r.value, rule.id)).toEqual(ruleOf(baseline(rule), rule.id));
  });

  it("l'attaque qui échoue n'empêche pas les modifications légitimes de la même couche", () => {
    const rule = LOCKED[0] as Rule;
    const l = layer("project", {
      add: [newRule("x.fine")],
      override: [override(rule.id, { disabled: true })],
    });
    const r = resolveEffectiveRules(real({ role: roleOf(rule), layers: [l] }));
    expect(r.ok && ruleIds(r.value)).toContain("x.fine");
  });
});

describe("verrou monotone posé par un niveau", () => {
  const LOCKED_ID = "node.esm";
  const lock = layer("organization", { lock: [LOCKED_ID] });

  it("l'organisation verrouille : groupe et projet ne peuvent plus l'affaiblir", () => {
    const base = ruleOf(resolveOk({ layers: [lock] }), LOCKED_ID);
    expect(base?.locked).toBe(true);
    for (const level of ["group", "project"] as const) {
      const r = resolveOk({
        layers: [lock, layer(level, { override: [override(LOCKED_ID, { disabled: true })] })],
      });
      expect(r.conflicts).toEqual([
        { ruleId: LOCKED_ID, level, attempted: "disable", reason: "locked" },
      ]);
      expect(ruleOf(r, LOCKED_ID)).toEqual(base);
    }
  });

  it("un niveau inférieur ne peut pas déverrouiller (protected:false ou liste vide)", () => {
    const unlock = layer("project", {
      lock: [],
      override: [override(LOCKED_ID, { protected: false })],
    });
    const r = resolveOk({ layers: [lock, layer("group"), unlock] });
    expect(ruleOf(r, LOCKED_ID)?.locked).toBe(true);
    expect(r.conflicts).toEqual([
      { ruleId: LOCKED_ID, level: "project", attempted: "unlock", reason: "locked" },
    ]);
  });

  it("le verrou est tracé (kind 'locked', niveau)", () => {
    const r = resolveOk({ layers: [lock] });
    expect(ruleOf(r, LOCKED_ID)?.trace.at(-1)).toMatchObject({
      kind: "locked",
      level: "organization",
    });
  });

  it("verrouiller une règle inconnue : conflit unknown-rule", () => {
    const r = resolveOk({ layers: [layer("organization", { lock: ["nope.nothing"] })] });
    expect(r.conflicts).toEqual([
      { ruleId: "nope.nothing", level: "organization", attempted: "lock", reason: "unknown-rule" },
    ]);
  });

  it("une règle ajoutée avec protected:true est verrouillée pour les niveaux inférieurs", () => {
    const org = layer("organization", { add: [newRule("org.must", { protected: true })] });
    const prj = layer("project", { override: [override("org.must", { severity: "advisory" })] });
    const r = resolveOk({ layers: [org, prj] });
    expect(ruleOf(r, "org.must")).toMatchObject({ locked: true, severity: "blocking" });
    expect(r.conflicts).toMatchObject([{ ruleId: "org.must", reason: "locked", level: "project" }]);
  });
});
