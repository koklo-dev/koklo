/** Message sous « Nom du dépôt » quand la règle n'est pas respectée (design/screens/S-projects.md §4.1). */
export const SPEC_REPO_NAME_ERROR =
  "Utilisez uniquement des lettres, chiffres, points, tirets et tirets bas (100 caractères maximum).";

/** Squelette Red (TK-48 / 48c) : règle du nom de dépôt, identique à celle de l'API. */
export function isValidSpecRepoName(_name: string): boolean {
  throw new Error("isValidSpecRepoName: non implémenté (TK-48c)");
}
