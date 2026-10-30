import { slugify } from "../organization/slug.ts";
import { validation } from "../tracker/api-errors.ts";

const MAX_NAME_LENGTH = 100;
const SUFFIX = "-spec";
const NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/** Slug du projet : sert au nom du dépôt et au manifeste (`projet`). */
export const projectSlugOf = (projectName: string): string =>
  slugify(projectName, { maxLength: MAX_NAME_LENGTH - SUFFIX.length, fallback: "projet" });

/**
 * Nom du dépôt de spec : celui du client s'il est valide pour GitHub, sinon `VALIDATION` (avant
 * tout réseau) ; par défaut `<slug du projet>-spec`.
 */
export function specRepoName(projectName: string, requested: string | undefined): string {
  if (requested === undefined) return `${projectSlugOf(projectName)}${SUFFIX}`;
  const reserved = requested === "." || requested === ".." || requested.endsWith(".git");
  if (!NAME_PATTERN.test(requested) || reserved) {
    throw validation(
      "name",
      "Nom de dépôt invalide : 1 à 100 caractères parmi lettres, chiffres, '.', '_' et '-' (ni '.', '..' ni suffixe '.git').",
    );
  }
  return requested;
}

/** Dossier de la spec dans un monorepo : relatif, sans remontée (`..`). */
export function checkSpecPath(role: string, specPath: string | undefined): string | null {
  if (specPath === undefined) return null;
  const segments = specPath.split("/");
  if (role === "spec") {
    throw validation(
      "specPath",
      "Un dépôt de rôle spec porte la spec à sa racine : pas de specPath.",
    );
  }
  if (specPath.startsWith("/") || specPath.includes("\\") || segments.includes("..")) {
    throw validation("specPath", "specPath doit être un chemin relatif, sans '..'.");
  }
  return specPath;
}
