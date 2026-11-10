import { isSafeSpecPath } from "@koklo/domain";
import { InvalidRepoNameError, projectSlugOf, specRepoName as specRepoNameOf } from "@koklo/github";
import { validation } from "../tracker/api-errors.ts";

export { projectSlugOf };

/**
 * Nom du dépôt de spec : celui du client s'il est valide pour GitHub, sinon `VALIDATION` (avant
 * tout réseau) ; par défaut `<slug du projet>-spec`. Règles : `@koklo/github`.
 */
export function specRepoName(projectName: string, requested: string | undefined): string {
  try {
    return specRepoNameOf(projectName, requested);
  } catch (error) {
    if (error instanceof InvalidRepoNameError) throw validation("name", error.message);
    throw error;
  }
}

/** Dossier de la spec dans un monorepo : relatif, sans remontée, sans `.git` (règle du domaine, aussi appliquée par le worker). */
export function checkSpecPath(role: string, specPath: string | undefined): string | null {
  if (specPath === undefined) return null;
  if (role === "spec") {
    throw validation(
      "specPath",
      "Un dépôt de rôle spec porte la spec à sa racine : pas de specPath.",
    );
  }
  if (!isSafeSpecPath(specPath)) {
    throw validation(
      "specPath",
      "specPath doit être un chemin relatif, sans '..', '.git', segment vide ni caractère de contrôle.",
    );
  }
  return specPath;
}
