import type { Catalog } from "./catalog-types.ts";

/** SQUELETTE (TK-71 lot C, Red) : renvoie un nouveau catalogue = `catalog` + profil `koklo-strict`
 *  + règles `strict.*` + ids verrouillés ajoutés à `protectedRuleIds`. Pure, idempotente. */
export const withKokloStrict = (catalog: Catalog): Catalog => catalog;
