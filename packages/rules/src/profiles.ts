import type { Catalog } from "./catalog-types.ts";
import { sortedUnique } from "./compare.ts";
import type { Conflict, RuleLayer } from "./layer-types.ts";
import type { ResolveInput } from "./resolve-types.ts";
import { type RulesError, rulesError } from "./rules-error.ts";

export const CORE_PROFILE = "core";

export interface ProfileSelection {
  readonly profiles: readonly string[];
  readonly conflicts: readonly Conflict[];
}

const isUnder = (packagePath: string, path: string): boolean =>
  packagePath === "." || path === packagePath || path.startsWith(`${packagePath}/`);

/** Sélection du paquet au plus long préfixe de `path`, sinon sélection racine. */
const selectionFor = (input: ResolveInput, path: string): readonly string[] => {
  const best = (input.packages ?? [])
    .filter((pkg) => isUnder(pkg.path, path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return best?.profiles ?? input.profiles ?? [];
};

const unknownProfile = (catalog: Catalog, profiles: readonly string[], where: string) => {
  const index = profiles.findIndex((profile) => !(profile in catalog.profiles));
  return index < 0
    ? undefined
    : rulesError(
        "resolve.unknown-profile",
        `unknown profile "${profiles[index]}"`,
        `${where}.${index}`,
      );
};

/** Refuse un profil inconnu dans la sélection racine ou dans un paquet. */
export const checkSelections = (input: ResolveInput): RulesError | undefined => {
  const root = unknownProfile(input.catalog, input.profiles ?? [], "profiles");
  if (root !== undefined) return root;
  for (const [index, pkg] of (input.packages ?? []).entries()) {
    const found = unknownProfile(input.catalog, pkg.profiles, `packages.${index}.profiles`);
    if (found !== undefined) return found;
  }
  return undefined;
};

const declaredBy = (catalog: Catalog, layer: RuleLayer): Conflict[] =>
  (layer.profiles ?? [])
    .filter((profile) => !(profile in catalog.profiles))
    .map((profile) => ({
      ruleId: profile,
      level: layer.level,
      attempted: "profile",
      reason: "unknown-profile",
    }));

/** `core` + sélection + profils déclarés par les couches ; un profil déclaré inconnu est un conflit. */
export const effectiveProfiles = (
  input: ResolveInput,
  layers: readonly RuleLayer[],
  path: string,
): ProfileSelection => {
  const declared = layers.flatMap((layer) =>
    (layer.profiles ?? []).filter((profile) => profile in input.catalog.profiles),
  );
  return {
    profiles: sortedUnique([CORE_PROFILE, ...selectionFor(input, path), ...declared]),
    conflicts: layers.flatMap((layer) => declaredBy(input.catalog, layer)),
  };
};
