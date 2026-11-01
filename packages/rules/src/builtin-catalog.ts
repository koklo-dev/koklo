import builtIn from "./catalog.json" with { type: "json" };
import type { Catalog } from "./catalog-types.ts";
import { parseCatalog } from "./parse-catalog.ts";

/** Catalogue livré avec le paquet (src/catalog.json, import JSON avec attribut). */
export const loadBuiltInCatalog = (): Catalog => {
  const result = parseCatalog(JSON.stringify(builtIn));
  if (!result.ok) {
    throw new Error(`built-in catalog is invalid: ${result.error.code} ${result.error.message}`);
  }
  return result.value;
};
