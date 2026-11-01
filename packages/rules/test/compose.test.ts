import { describe, expect, it } from "vitest";
import { type Resolution, resolveEffectiveRules } from "../src/index.ts";
import {
  AUTHOR,
  FUTURE,
  input,
  layer,
  NOW,
  newRule,
  override,
  PAST,
  resolveOk,
  ruleIds,
  ruleOf,
  smallCatalog,
  WHY,
} from "./compose-fixtures.ts";

describe("composition par couches (table-driven)", () => {
  it("sans couche : profils core + sélection, filtrés par rôle, triés par id", () => {
    const r = resolveOk();
    expect(ruleIds(r)).toEqual(["global.scope", "global.secrets", "node.esm", "node.tests"]);
    expect(r.profiles).toEqual(["core", "node"]);
    expect(r.catalogVersion).toBe("2026.11.0");
    expect(ruleOf(r, "node.esm")?.origin).toBe("catalog");
    expect(ruleOf(r, "node.esm")?.trace).toMatchObject([{ kind: "catalog", level: "catalog" }]);
    expect(ruleOf(r, "global.secrets")?.locked).toBe(true);
    expect(ruleOf(r, "node.esm")?.locked).toBe(false);
  });

  it.each([["organization"], ["group"], ["project"]] as const)(
    "une couche %s ajoute une règle, tracée avec son niveau",
    (level) => {
      const r = resolveOk({ layers: [layer(level, { add: [newRule("x.added")] })] });
      expect(ruleOf(r, "x.added")).toMatchObject({ origin: level, locked: false });
      expect(ruleOf(r, "x.added")?.trace).toMatchObject([{ kind: "added", level, author: AUTHOR }]);
    },
  );

  it("durcir (advisory -> blocking) est tracé 'hardened' avec auteur et justification", () => {
    const r = resolveOk({
      layers: [layer("project", { override: [override("node.esm", { severity: "blocking" })] })],
    });
    expect(ruleOf(r, "node.esm")?.severity).toBe("blocking");
    expect(ruleOf(r, "node.esm")?.trace.at(-1)).toMatchObject({
      kind: "hardened",
      level: "project",
      author: AUTHOR,
      justification: WHY,
    });
  });
});

describe("composition : assouplir et désactiver", () => {
  it("assouplir une règle non verrouillée est possible et tracé avec l'expiration", () => {
    const r = resolveOk({
      layers: [
        layer("project", {
          override: [override("node.tests", { severity: "advisory", expires: FUTURE })],
        }),
      ],
    });
    expect(ruleOf(r, "node.tests")?.severity).toBe("advisory");
    expect(ruleOf(r, "node.tests")?.trace.at(-1)).toMatchObject({
      kind: "overridden",
      level: "project",
      author: AUTHOR,
      justification: WHY,
      expires: FUTURE,
    });
    expect(r.conflicts).toEqual([]);
  });

  it("désactiver une règle non verrouillée la retire et la liste dans `disabled`", () => {
    const r = resolveOk({
      layers: [layer("group", { override: [override("node.esm", { disabled: true })] })],
    });
    expect(ruleIds(r)).not.toContain("node.esm");
    expect(r.disabled).toEqual([
      { ruleId: "node.esm", level: "group", author: AUTHOR, justification: WHY },
    ]);
  });

  it("durcir une règle verrouillée reste permis (le verrou n'empêche que d'affaiblir)", () => {
    const r = resolveOk({
      layers: [
        layer("organization", { lock: ["node.esm"] }),
        layer("project", { override: [override("node.esm", { severity: "blocking" })] }),
      ],
    });
    expect(ruleOf(r, "node.esm")).toMatchObject({ severity: "blocking", locked: true });
    expect(r.conflicts).toEqual([]);
  });
});

describe("composition : précédence et collisions", () => {
  it("précédence org -> groupe -> projet : le niveau le plus bas gagne sur le non verrouillé", () => {
    const org = layer("organization", {
      override: [override("node.tests", { severity: "advisory" })],
    });
    const prj = layer("project", { override: [override("node.tests", { severity: "blocking" })] });
    const r = resolveOk({ layers: [prj, org] });
    expect(ruleOf(r, "node.tests")?.severity).toBe("blocking");
    expect(ruleOf(r, "node.tests")?.trace.map((t) => t.level)).toEqual([
      "catalog",
      "organization",
      "project",
    ]);
  });

  it("id d'ajout déjà pris par une règle non verrouillée sans `replaces` = erreur layer.collision", () => {
    const r = resolveEffectiveRules(
      input({ layers: [layer("project", { add: [newRule("node.esm")] })] }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: "layer.collision" } });
  });

  it("`replaces` sur une règle non verrouillée la remplace (tracé)", () => {
    const r = resolveOk({
      layers: [layer("project", { add: [newRule("x.better-esm", { replaces: "node.esm" })] })],
    });
    expect(ruleIds(r)).toContain("x.better-esm");
    expect(ruleIds(r)).not.toContain("node.esm");
  });

  it("surcharge d'une règle inconnue : conflit unknown-rule, rien d'autre ne change", () => {
    const r = resolveOk({
      layers: [layer("project", { override: [override("nope.nothing", { disabled: true })] })],
    });
    expect(r.conflicts).toEqual([
      { ruleId: "nope.nothing", level: "project", attempted: "override", reason: "unknown-rule" },
    ]);
    expect(ruleIds(r)).toEqual(ruleIds(resolveOk()));
  });
});

describe("composition : surcharges expirées et inconnues", () => {
  it("surcharge expirée : ignorée et signalée 'expired', règle inchangée", () => {
    const r = resolveOk({
      layers: [
        layer("project", { override: [override("node.tests", { disabled: true, expires: PAST })] }),
      ],
    });
    expect(ruleOf(r, "node.tests")).toEqual(ruleOf(resolveOk(), "node.tests"));
    expect(r.conflicts).toEqual([
      { ruleId: "node.tests", level: "project", attempted: "disable", reason: "expired" },
    ]);
  });

  it("une surcharge qui expire le jour de `now` est encore valide (borne incluse)", () => {
    const r = resolveOk({
      layers: [
        layer("project", { override: [override("node.esm", { disabled: true, expires: NOW })] }),
      ],
    });
    expect(ruleIds(r)).not.toContain("node.esm");
  });

  it("règle ajoutée dont le profil est inconnu du catalogue : conflit unknown-profile, non ajoutée", () => {
    const r = resolveOk({
      layers: [layer("project", { add: [newRule("x.odd", { profiles: ["ghost"] })] })],
    });
    expect(ruleIds(r)).not.toContain("x.odd");
    expect(r.conflicts).toEqual([
      { ruleId: "x.odd", level: "project", attempted: "override", reason: "unknown-profile" },
    ]);
  });
});

describe("profils effectifs", () => {
  it("`core` est toujours présent, même sans sélection", () => {
    expect(resolveOk({ profiles: [] }).profiles).toEqual(["core"]);
    expect(ruleIds(resolveOk({ profiles: [] }))).toEqual(["global.scope", "global.secrets"]);
  });
  it("un profil métier n'est jamais déduit : sans déclaration, ses règles sont absentes", () => {
    const base = { role: "qa-reviewer", profiles: ["node"] } as const;
    expect(ruleIds(resolveOk(base))).not.toContain("sec.review");
  });
  it("un profil déclaré par une couche active ses règles", () => {
    const r = resolveOk({
      role: "qa-reviewer",
      layers: [layer("organization", { profiles: ["security"] })],
    });
    expect(ruleIds(r)).toContain("sec.review");
    expect(r.profiles).toEqual(["core", "node", "security"]);
  });
  it("profil déclaré inconnu : conflit unknown-profile, profil ignoré", () => {
    const r = resolveOk({ layers: [layer("group", { profiles: ["ghost"] })] });
    expect(r.profiles).toEqual(["core", "node"]);
    expect(r.conflicts).toEqual([
      { ruleId: "ghost", level: "group", attempted: "profile", reason: "unknown-profile" },
    ]);
  });
  it("le paquet au plus long préfixe remplace la sélection racine", () => {
    const packages = [
      { path: "packages", profiles: ["core"] },
      { path: "packages/api", profiles: ["core", "security"] },
    ];
    const r = resolveOk({ role: "qa-reviewer", packages, path: "packages/api/src/a.ts" });
    expect(r.profiles).toEqual(["core", "security"]);
    expect(resolveOk({ packages, path: "packages/apix/a.ts" }).profiles).toEqual(["core"]);
    expect(resolveOk({ packages, path: "apps/web" }).profiles).toEqual(["core", "node"]);
  });
  it("profil inconnu dans la sélection racine ou un paquet : erreur resolve.unknown-profile", () => {
    for (const extra of [
      { profiles: ["ghost"] },
      { packages: [{ path: "packages/api", profiles: ["ghost"] }] },
    ]) {
      expect(resolveEffectiveRules(input(extra))).toMatchObject({
        ok: false,
        error: { code: "resolve.unknown-profile" },
      });
    }
  });
});

describe("résolution par rôle et par chemin", () => {
  it.each([
    ["developer", ["global.scope", "global.secrets", "node.esm", "node.tests"]],
    ["qa-reviewer", ["global.secrets", "node.tests"]],
    ["doc-writer", ["docs.only"]],
    ["tech-lead", []],
  ] as const)("rôle %s", (role, expected) => {
    expect(ruleIds(resolveOk({ role }))).toEqual(expected);
  });

  const scoped = newRule("x.api-only", { paths: ["packages/api/**"] });
  it.each([
    ["packages/api/src/a.ts", true],
    ["packages/api", true],
    ["packages/web/src/a.ts", false],
    ["packages/apix/a.ts", false],
    [".", false],
  ])("règle ajoutée avec paths: chemin %s -> %s", (path, expected) => {
    const r = resolveOk({ path, layers: [layer("project", { add: [scoped] })] });
    expect(ruleIds(r).includes("x.api-only")).toBe(expected);
  });

  it("excludePaths d'une règle ajoutée l'écarte sur ces chemins", () => {
    const rule = newRule("x.no-tests", { excludePaths: ["**/*.test.ts"] });
    const l = [layer("project", { add: [rule] })];
    expect(ruleIds(resolveOk({ layers: l, path: "src/a.ts" }))).toContain("x.no-tests");
    expect(ruleIds(resolveOk({ layers: l, path: "src/a.test.ts" }))).not.toContain("x.no-tests");
  });

  it("assouplir par excludePaths une règle non verrouillée est permis", () => {
    const l = [
      layer("project", { override: [override("node.esm", { excludePaths: ["legacy/**"] })] }),
    ];
    expect(ruleIds(resolveOk({ layers: l, path: "legacy/a.js" }))).not.toContain("node.esm");
    expect(ruleIds(resolveOk({ layers: l, path: "src/a.js" }))).toContain("node.esm");
  });

  it("retirer un agent d'une règle non verrouillée est permis", () => {
    const l = [
      layer("project", { override: [override("node.tests", { agents: ["qa-reviewer"] })] }),
    ];
    expect(ruleIds(resolveOk({ layers: l }))).not.toContain("node.tests");
    expect(ruleIds(resolveOk({ layers: l, role: "qa-reviewer" }))).toContain("node.tests");
  });

  it("normalise le chemin dans la résolution", () => {
    expect(resolveOk({ path: "./packages//api/" }).path).toBe("packages/api");
    expect(resolveOk({ path: "" }).path).toBe(".");
  });
});

describe("entrées invalides", () => {
  it.each([
    ["role inconnu", { role: "ceo" }, "resolve.invalid-role"],
    ["chemin avec ..", { path: "a/../../etc" }, "resolve.invalid-path"],
    ["chemin absolu", { path: "/etc/passwd" }, "resolve.invalid-path"],
    ["chemin avec antislash", { path: "a\\b" }, "resolve.invalid-path"],
    ["now non ISO", { now: "demain" }, "resolve.invalid-now"],
    ["now impossible", { now: "2026-13-45" }, "resolve.invalid-now"],
    ["now vide", { now: "" }, "resolve.invalid-now"],
  ])("%s", (_name, extra, code) => {
    expect(resolveEffectiveRules(input(extra as never))).toMatchObject({
      ok: false,
      error: { code },
    });
  });

  it("deux couches du même niveau : layer.duplicate-level", () => {
    const r = resolveEffectiveRules(input({ layers: [layer("group"), layer("group")] }));
    expect(r).toMatchObject({ ok: false, error: { code: "layer.duplicate-level" } });
  });
  it("une couche invalide (surcharge sans auteur) est refusée à la résolution", () => {
    const bad = layer("project", { override: [{ ruleId: "node.esm", disabled: true } as never] });
    expect(resolveEffectiveRules(input({ layers: [bad] }))).toMatchObject({
      ok: false,
      error: { code: "layer.invalid-shape" },
    });
  });
});

describe("déterminisme et immutabilité", () => {
  const layers = [
    layer("organization", { profiles: ["security"], lock: ["node.esm"] }),
    layer("group", { add: [newRule("x.group")] }),
    layer("project", { override: [override("node.tests", { severity: "advisory" })] }),
  ];
  const run = (over = {}): Resolution => resolveOk({ role: "qa-reviewer", layers, ...over });

  it("toutes les permutations des couches donnent le même résultat", () => {
    const [a, b, c] = layers;
    const perms = [
      [a, b, c],
      [c, b, a],
      [b, a, c],
      [c, a, b],
    ];
    for (const p of perms) expect(run({ layers: p })).toEqual(run());
  });
  it("l'ordre des règles du catalogue n'influence pas la sortie (triée par id)", () => {
    const catalog = smallCatalog();
    const reversed = { ...catalog, rules: [...catalog.rules].reverse() };
    expect(run({ catalog: reversed })).toEqual(run());
    expect(ruleIds(run())).toEqual([...ruleIds(run())].sort());
  });
  it("deux appels identiques donnent des résultats égaux et la sortie survit à JSON", () => {
    expect(run()).toEqual(run());
    expect(JSON.parse(JSON.stringify(run()))).toEqual(run());
  });
  it("ne modifie pas ses entrées (gelées)", () => {
    const deepFreeze = <T>(o: T): T => {
      if (o && typeof o === "object") {
        for (const v of Object.values(o)) deepFreeze(v);
        Object.freeze(o);
      }
      return o;
    };
    expect(() =>
      run({ catalog: deepFreeze(smallCatalog()), layers: deepFreeze([...layers]) }),
    ).not.toThrow();
  });
});
