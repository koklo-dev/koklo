import { isFeatureId, isSafeSpecPath, isValidBranchName } from "@koklo/domain";
import type { BatchOperation, LoadedBatch } from "./types.ts";

const MAX_SLUG_LENGTH = 40;
const FEATURE_FILE = /^features\/(F-\d{3,})(?:-[^/]*)?\.md$/;
export const OPERATION_KINDS = ["feature.create", "feature.update", "feature.delete"] as const;

/** Slug du titre : minuscules, sans accents, `[a-z0-9-]`, 40 caractères au plus, repli `feature`. */
export function slugOf(title: unknown): string {
  const text = typeof title === "string" ? title : "";
  const slug = text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
  return slug === "" ? "feature" : slug;
}

/** Chemin (relatif à la racine de la spec) d'une feature nouvelle. */
export const featurePathOf = (specId: string, title: unknown): string =>
  `features/${specId}-${slugOf(title)}.md`;

/** Identifiant de la feature portée par un chemin `features/F-nnn[-slug].md`, sinon `undefined`. */
export const featureIdOfPath = (path: string): string | undefined => FEATURE_FILE.exec(path)?.[1];

/** Préfixe un chemin de la spec par le dossier du monorepo (`specPath`), s'il y en a un. */
export const withSpecPath = (specPath: string | null, path: string): string =>
  specPath === null ? path : `${specPath}/${path}`;

/** Retire le préfixe de la spec ; `undefined` si le chemin est hors du dossier de la spec. */
export function relativeToSpec(specPath: string | null, path: string): string | undefined {
  if (specPath === null) return path;
  return path.startsWith(`${specPath}/`) ? path.slice(specPath.length + 1) : undefined;
}

function operationProblem(operation: BatchOperation): string | undefined {
  if (!(OPERATION_KINDS as readonly string[]).includes(operation.kind)) return "kind";
  return isFeatureId(operation.targetSpecId) ? undefined : "specId";
}

/**
 * Intégrité des données lues en base, vérifiée AVANT tout appel au fournisseur : une branche, un
 * dossier de spec ou un identifiant d'opération douteux finirait dans un chemin ou une requête.
 * Rend le nom du champ fautif (jamais sa valeur), `undefined` si tout est sain.
 */
export function integrityProblem(batch: LoadedBatch): string | undefined {
  if (!isValidBranchName(batch.branch)) return "branch";
  if (batch.repo.specPath !== null && !isSafeSpecPath(batch.repo.specPath)) return "specPath";
  for (const operation of batch.operations) {
    const problem = operationProblem(operation);
    if (problem) return problem;
  }
  return undefined;
}
