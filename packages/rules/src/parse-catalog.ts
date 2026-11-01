import type { CatalogResult } from "./catalog-error.ts";

/** Taille maximale acceptée (octets UTF-8) : 1 Mio. */
export const MAX_CATALOG_BYTES = 1_048_576;

export const parseCatalog = (_json: string): CatalogResult => {
  throw new Error("not implemented (TK-71 lot A, Green)");
};
