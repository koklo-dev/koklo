import { checkRawDocument, checkSemantics } from "./catalog-checks.ts";
import type { CatalogError, CatalogResult } from "./catalog-error.ts";
import { catalogSchema } from "./catalog-schema.ts";

/** Taille maximale acceptée (octets UTF-8) : 1 Mio. */
export const MAX_CATALOG_BYTES = 1_048_576;

const failure = (error: CatalogError): CatalogResult => ({ ok: false, error });

const decode = (json: string): { doc: unknown } | { error: CatalogError } => {
  try {
    return { doc: JSON.parse(json) as unknown };
  } catch (cause) {
    return { error: { code: "catalog.invalid-json", message: (cause as Error).message } };
  }
};

/** Analyse un catalogue JSON (snake_case) ; ne lève jamais. Ordre : taille, JSON, schéma, sémantique. */
export const parseCatalog = (json: string): CatalogResult => {
  if (new TextEncoder().encode(json).byteLength > MAX_CATALOG_BYTES) {
    return failure({ code: "catalog.too-large", message: "catalog exceeds 1 MiB" });
  }
  const decoded = decode(json);
  if ("error" in decoded) return failure(decoded.error);
  const raw = checkRawDocument(decoded.doc);
  if (raw !== undefined) return failure(raw);
  const parsed = catalogSchema.safeParse(decoded.doc);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".");
    const message = issue?.message ?? "invalid catalog";
    return failure(
      path
        ? { code: "catalog.invalid-shape", message, path }
        : { code: "catalog.invalid-shape", message },
    );
  }
  const semantic = checkSemantics(parsed.data);
  return semantic === undefined ? { ok: true, value: parsed.data } : failure(semantic);
};
