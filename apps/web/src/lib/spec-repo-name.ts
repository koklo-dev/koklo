/** Message sous « Nom du dépôt » quand la règle n'est pas respectée (design/screens/S-projects.md §4.1). */
export const SPEC_REPO_NAME_ERROR =
  "Utilisez uniquement des lettres, chiffres, points, tirets et tirets bas (100 caractères maximum).";

const ALLOWED = /^[A-Za-z0-9._-]{1,100}$/;

/** Règle du nom de dépôt, identique à celle de l'API : ni `.` ni `..`, pas de suffixe `.git`. */
export function isValidSpecRepoName(name: string): boolean {
  return ALLOWED.test(name) && name !== "." && name !== ".." && !/\.git$/i.test(name);
}
