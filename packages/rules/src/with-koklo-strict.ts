import type { Catalog } from "./catalog-types.ts";
import { frozenCopy } from "./freeze.ts";
import { KOKLO_STRICT_PROFILE_ID, kokloStrictProfile } from "./koklo-strict.ts";

/** Catalogue koklo = `catalog` + profil `koklo-strict` + règles `strict.*` + ids verrouillés
 *  ajoutés à `protectedRuleIds`. Une règle `strict.*` préexistante est remplacée par la
 *  définition koklo-strict (jamais gardée plus faible). Pure (entrée intacte, sortie gelée) et idempotente. */
export const withKokloStrict = (catalog: Catalog): Catalog => {
  const strictIds = new Set(kokloStrictProfile.rules.map((rule) => rule.id));
  const kept = catalog.rules.filter((rule) => !strictIds.has(rule.id));
  return frozenCopy({
    ...catalog,
    protectedRuleIds: [
      ...catalog.protectedRuleIds,
      ...kokloStrictProfile.lockedRuleIds.filter((id) => !catalog.protectedRuleIds.includes(id)),
    ],
    profiles: { ...catalog.profiles, [KOKLO_STRICT_PROFILE_ID]: kokloStrictProfile.profile },
    rules: [...kept, ...kokloStrictProfile.rules],
  });
};
