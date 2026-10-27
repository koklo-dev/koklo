import { createHash } from "node:crypto";

export type OpenApiVersions = Record<string, string>;

/** Empreinte sha256 d'un document OpenAPI (déjà à clés triées). */
export const hashDocument = (document: unknown): string =>
  createHash("sha256").update(JSON.stringify(document)).digest("hex");

/**
 * Enregistre l'empreinte du document pour `version`. Une version déjà connue ne peut pas
 * changer de contenu : il faut en publier une nouvelle. Pur, sans I/O.
 */
export const recordVersion = (
  versions: OpenApiVersions,
  version: string,
  document: unknown,
): OpenApiVersions => {
  const hash = hashDocument(document);
  const known = versions[version];
  if (known !== undefined && known !== hash) {
    throw new Error(
      `L'OpenAPI a changé sans changement de version : ${version} est déjà enregistrée avec une autre empreinte. Incrémentez la version dans package.json et src/version.ts.`,
    );
  }
  return { ...versions, [version]: hash };
};
