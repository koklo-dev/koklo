/** Message sous « Nom du dépôt » quand la règle n'est pas respectée (design/screens/S-projects.md §4.1). */
export const SPEC_REPO_NAME_ERROR =
  "Utilisez uniquement des lettres, chiffres, points, tirets et tirets bas (100 caractères maximum).";

const ALLOWED = /^[A-Za-z0-9._-]{1,100}$/;

/** Règle du nom de dépôt, identique à celle de l'API : ni `.` ni `..`, pas de suffixe `.git`. */
export function isValidSpecRepoName(name: string): boolean {
  return ALLOWED.test(name) && name !== "." && name !== ".." && !/\.git$/i.test(name);
}

const SLUG_MAX = 80;

/** Nom de dépôt proposé pour un projet : son nom en minuscules sans accents, suivi de « -spec » (aperçu seulement). */
export function suggestedRepoName(projectName: string): string {
  const slug = projectName
    .normalize("NFD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replaceAll(/-+$/g, "");
  return `${slug.length >= 2 ? slug : "projet"}-spec`;
}
