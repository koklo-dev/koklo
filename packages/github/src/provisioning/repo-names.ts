import { slugify } from "@koklo/domain";

const MAX_NAME_LENGTH = 100;
const SUFFIX = "-spec";
const NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export const REPO_NAME_RULE =
  "Nom de dépôt invalide : 1 à 100 caractères parmi lettres, chiffres, '.', '_' et '-' (ni '.', '..' ni suffixe '.git').";

/** Nom de dépôt refusé avant tout appel réseau : l'appelant le traduit (`VALIDATION`, `invalid_name`). */
export class InvalidRepoNameError extends Error {
  constructor() {
    super(REPO_NAME_RULE);
    this.name = "InvalidRepoNameError";
  }
}

/** Slug du projet : sert au nom du dépôt et au manifeste (`projet`). */
export const projectSlugOf = (projectName: string): string =>
  slugify(projectName, { maxLength: MAX_NAME_LENGTH - SUFFIX.length, fallback: "projet" });

/** Un nom de dépôt acceptable par GitHub : motif, ni `.` ni `..`, pas de suffixe `.git`. */
export const isValidRepoName = (name: string): boolean =>
  NAME_PATTERN.test(name) && name !== "." && name !== ".." && !name.endsWith(".git");

/**
 * Nom du dépôt de spec : celui du client s'il est valide, sinon `InvalidRepoNameError` (avant tout
 * réseau) ; par défaut `<slug du projet>-spec`.
 */
export function specRepoName(projectName: string, requested: string | undefined): string {
  if (requested === undefined) return `${projectSlugOf(projectName)}${SUFFIX}`;
  if (!isValidRepoName(requested)) throw new InvalidRepoNameError();
  return requested;
}
