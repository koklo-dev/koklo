import {
  type Catalog,
  loadBuiltInCatalog,
  type Resolution,
  type ResolveInput,
  type Rule,
  resolveEffectiveRules,
  withKokloStrict,
} from "../src/index.ts";
import { layer, NOW, SRC_FILE } from "./compose-fixtures.ts";
import { readFixture } from "./helpers.ts";

export interface StrictSnapshotRule {
  readonly id: string;
  readonly severity: Rule["severity"];
  readonly protected: boolean;
  readonly agents: Rule["agents"];
  readonly enforcement: Rule["enforcement"];
}

/** Liste figée des règles `strict.*` (vision §17.1 à 17.3) : toute dérive casse un test. */
export const strictSnapshot: readonly StrictSnapshotRule[] = JSON.parse(
  readFixture("koklo-strict-snapshot.json"),
);

/** Ids verrouillés par D3 : limites chiffrées, domain-purity, conventional-commits. */
export const LOCKED_STRICT_IDS: readonly string[] = [
  "strict.cognitive-complexity",
  "strict.conventional-commits",
  "strict.domain-purity",
  "strict.file-size-source",
  "strict.file-size-test",
  "strict.fn-lines",
  "strict.max-params",
  "strict.no-explicit-any",
];

export const STRICT_IDS: readonly string[] = strictSnapshot.map((r) => r.id);
export const strictCatalog = (): Catalog => withKokloStrict(loadBuiltInCatalog());

/** Entrée de résolution sur le catalogue koklo ; `strict` active le profil par une couche projet. */
export const strictInput = (extra: Partial<ResolveInput> = {}): ResolveInput => ({
  catalog: strictCatalog(),
  layers: [],
  role: "developer",
  path: SRC_FILE,
  now: NOW,
  profiles: ["node", "typescript"],
  ...extra,
});

export const activated = layer("project", { profiles: ["koklo-strict"] });

export const resolveStrict = (extra: Partial<ResolveInput> = {}): Resolution => {
  const result = resolveEffectiveRules(strictInput(extra));
  if (!result.ok) throw new Error(`résolution refusée : ${result.error.code}`);
  return result.value;
};

/** Catalogue sérialisé au format JSON d'entrée (snake_case) pour repasser par `parseCatalog`. */
export const toCatalogJson = (catalog: Catalog): string =>
  JSON.stringify({
    schema_version: catalog.schemaVersion,
    catalog_version: catalog.catalogVersion,
    protected_rule_ids: catalog.protectedRuleIds,
    profiles: catalog.profiles,
    rules: catalog.rules,
  });
