import { describe, expect, it } from "vitest";
import {
  KOKLO_STRICT_PROFILE_ID,
  kokloStrictProfile,
  loadBuiltInCatalog,
  parseCatalog,
  renderExplanation,
  resolveEffectiveRules,
  withKokloStrict,
} from "../src/index.ts";
import { layer, ruleIds } from "./compose-fixtures.ts";
import {
  activated,
  LOCKED_STRICT_IDS,
  resolveStrict,
  STRICT_IDS,
  strictCatalog,
  strictInput,
  toCatalogJson,
} from "./koklo-strict-fixtures.ts";

const strictIn = (ids: readonly string[]) => ids.filter((id) => id.startsWith("strict."));

describe("withKokloStrict : catalogue koklo = catalogue Shipyard + profil", () => {
  it("ajoute le profil `koklo-strict` (kind standard) et les 16 règles", () => {
    const c = strictCatalog();
    expect(c.profiles[KOKLO_STRICT_PROFILE_ID]).toEqual(kokloStrictProfile.profile);
    expect(c.profiles[KOKLO_STRICT_PROFILE_ID]?.kind).toBe("standard");
    expect(strictIn(c.rules.map((r) => r.id))).toEqual(STRICT_IDS);
    expect(c.rules).toHaveLength(loadBuiltInCatalog().rules.length + 16);
  });

  it("verrouille les 8 règles D3 en plus des 4 protégées de Shipyard", () => {
    const c = strictCatalog();
    expect([...c.protectedRuleIds].sort()).toEqual(
      [...loadBuiltInCatalog().protectedRuleIds, ...LOCKED_STRICT_IDS].sort(),
    );
  });

  it("le résultat repasse parseCatalog (protégés cohérents, profils connus, params acceptés)", () => {
    const parsed = parseCatalog(toCatalogJson(strictCatalog()));
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });

  it("ne modifie pas son entrée et est idempotente", () => {
    const base = loadBuiltInCatalog();
    const snapshot = JSON.stringify(base);
    const once = withKokloStrict(base);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(withKokloStrict(once)).toEqual(once);
    expect(base.profiles).not.toHaveProperty("koklo-strict");
  });

  it("conserve la version du catalogue et les règles Shipyard intactes", () => {
    const base = loadBuiltInCatalog();
    const c = withKokloStrict(base);
    expect(c.catalogVersion).toBe(base.catalogVersion);
    expect(c.rules.filter((r) => !r.id.startsWith("strict."))).toEqual(base.rules);
  });
});

describe("profil `standard` : activé explicitement, jamais déduit (D2)", () => {
  it("un projet sans le profil n'a aucune règle strict, pour tous les rôles", () => {
    for (const role of ["developer", "qa-reviewer", "tech-lead"] as const) {
      const r = resolveStrict({ role });
      expect(strictIn(ruleIds(r)), role).toEqual([]);
      expect(r.profiles).not.toContain("koklo-strict");
    }
  });

  it("les 13 profils Shipyard réunis ne déduisent pas koklo-strict", () => {
    const all = Object.keys(loadBuiltInCatalog().profiles);
    const r = resolveStrict({ profiles: all });
    expect(strictIn(ruleIds(r))).toEqual([]);
    expect(r.profiles).not.toContain("koklo-strict");
  });

  it("une couche projet qui déclare le profil l'active", () => {
    const r = resolveStrict({ layers: [activated] });
    expect(r.profiles).toContain("koklo-strict");
    expect(strictIn(ruleIds(r))).toEqual(STRICT_IDS);
  });

  it.each(["organization", "group", "project"] as const)(
    "déclaré par le niveau %s, le profil est actif",
    (level) => {
      const r = resolveStrict({ layers: [layer(level, { profiles: ["koklo-strict"] })] });
      expect(strictIn(ruleIds(r))).toEqual(STRICT_IDS);
    },
  );
});

describe("profil `standard` : sélection racine, paquet et catalogue", () => {
  it("la sélection racine ou paquet peut aussi le choisir explicitement", () => {
    const root = resolveStrict({ profiles: ["node", "koklo-strict"] });
    expect(strictIn(ruleIds(root))).toEqual(STRICT_IDS);
    const pkg = resolveStrict({
      profiles: ["node"],
      packages: [{ path: "packages/api", profiles: ["koklo-strict"] }],
      path: "packages/api/src/a.ts",
    });
    expect(strictIn(ruleIds(pkg))).toEqual(STRICT_IDS);
    const other = resolveStrict({
      profiles: ["node"],
      packages: [{ path: "packages/web", profiles: ["koklo-strict"] }],
      path: "packages/api/src/a.ts",
    });
    expect(strictIn(ruleIds(other))).toEqual([]);
  });

  it("sur le catalogue Shipyard seul (sans withKokloStrict), le profil est inconnu", () => {
    const base = resolveEffectiveRules(
      strictInput({ catalog: loadBuiltInCatalog(), profiles: ["koklo-strict"] }),
    );
    expect(base.ok).toBe(false);
    if (!base.ok) expect(base.error.code).toBe("resolve.unknown-profile");
    const declared = resolveEffectiveRules(
      strictInput({ catalog: loadBuiltInCatalog(), layers: [activated] }),
    );
    expect(declared.ok).toBe(true);
    if (declared.ok) {
      expect(declared.value.conflicts).toEqual([
        {
          ruleId: "koklo-strict",
          level: "project",
          attempted: "profile",
          reason: "unknown-profile",
        },
      ]);
    }
  });

  it.each(["developer", "qa-reviewer", "tech-lead"] as const)(
    "profil activé : les 16 règles sont effectives pour %s",
    (role) => {
      const r = resolveStrict({ layers: [activated], role });
      expect(strictIn(ruleIds(r))).toEqual(STRICT_IDS);
    },
  );
});

describe("profil `standard` : rôles et déterminisme", () => {
  it("les rôles hors liste (designer, doc-writer) ne reçoivent pas les règles strict", () => {
    for (const role of ["designer", "doc-writer", "product-owner"] as const) {
      expect(strictIn(ruleIds(resolveStrict({ layers: [activated], role })))).toEqual([]);
    }
  });

  it("les règles Shipyard déjà actives restent présentes à côté des strict", () => {
    const without = ruleIds(resolveStrict());
    const withStrict = ruleIds(resolveStrict({ layers: [activated] }));
    for (const id of without) expect(withStrict).toContain(id);
  });

  it("résolution déterministe, triée par id, sérialisable, tracée au catalogue", () => {
    const a = resolveStrict({ layers: [activated] });
    const b = resolveStrict({ layers: [activated] });
    expect(a).toEqual(b);
    expect(ruleIds(a)).toEqual([...ruleIds(a)].sort());
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    const fn = a.rules.find((x) => x.id === "strict.fn-lines");
    expect(fn).toMatchObject({ origin: "catalog", locked: true });
    expect(fn?.enforcement).toMatchObject({ params: { max: 50 } });
    expect(a.rules.find((x) => x.id === "strict.thin-controllers")?.locked).toBe(false);
  });

  it("l'explication affiche les règles strict avec la source framework", () => {
    const text = renderExplanation(resolveStrict({ layers: [activated] }));
    expect(text).toContain("[BLOCKING] strict.fn-lines");
    expect(text).toContain("gate/biome");
  });
});
