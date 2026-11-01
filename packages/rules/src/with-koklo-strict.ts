import type { Catalog } from "./catalog-types.ts";
import { frozenCopy } from "./freeze.ts";
import { KOKLO_STRICT_PROFILE_ID, kokloStrictProfile } from "./koklo-strict.ts";

/** Catalogue koklo = `catalog` + profil `koklo-strict` + règles `strict.*` + ids verrouillés
 *  ajoutés à `protectedRuleIds`. Pure (entrée intacte, sortie gelée) et idempotente. */
export const withKokloStrict = (catalog: Catalog): Catalog => {
  const known = new Set(catalog.rules.map((rule) => rule.id));
  const added = kokloStrictProfile.rules.filter((rule) => !known.has(rule.id));
  return frozenCopy({
    ...catalog,
    protectedRuleIds: [
      ...catalog.protectedRuleIds,
      ...kokloStrictProfile.lockedRuleIds.filter((id) => !catalog.protectedRuleIds.includes(id)),
    ],
    profiles: { ...catalog.profiles, [KOKLO_STRICT_PROFILE_ID]: kokloStrictProfile.profile },
    rules: [...catalog.rules, ...added],
  });
};
