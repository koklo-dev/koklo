import type { Catalog } from "./catalog-types.ts";

export const CATALOG_ERROR_CODES = [
  "catalog.too-large",
  "catalog.invalid-json",
  "catalog.invalid-shape",
  "catalog.unknown-version",
  "catalog.duplicate-id",
  "catalog.missing-enforcement",
  "catalog.unknown-enforcement",
  "catalog.unknown-profile",
  "catalog.unknown-protected-id",
  "catalog.protected-mismatch",
] as const;
export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];

export interface CatalogError {
  readonly code: CatalogErrorCode;
  readonly message: string;
  /** Chemin dans le document (ex. `rules.3.enforcement`), absent si non applicable. */
  readonly path?: string;
}

export type CatalogResult =
  | { readonly ok: true; readonly value: Catalog }
  | { readonly ok: false; readonly error: CatalogError };
