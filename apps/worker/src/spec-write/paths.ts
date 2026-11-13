import { isFeatureId, isSafeSpecPath, isValidBranchName, slugOf as slugTitle } from "@koklo/domain";
import {
  ideaDeleteSlug,
  ideaIndexPayload,
  ideaPagePayload,
  ideaSynthesisPayload,
  ideaTagName,
} from "./idea-payload.ts";
import type { BatchOperation, LoadedBatch } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FEATURE_FILE = /^features\/(F-\d{3,})(?:-[^/]*)?\.md$/;
export const OPERATION_KINDS = [
  "feature.create",
  "feature.update",
  "feature.delete",
  "rule.create",
  "rule.update",
  "rule.delete",
  "role.create",
  "role.update",
  "role.delete",
  "flow.create",
  "flow.update",
  "flow.delete",
] as const;
const TARGET_ID: Readonly<Record<string, RegExp>> = {
  rule: /^R-\d{3,}$/,
  role: /^RL-[a-z0-9][a-z0-9-]*$/,
  flow: /^P-[a-z0-9][a-z0-9-]*$/,
};
/** Opérations de publication de l'espace Idée (TK-89) : un lot n'en mêle jamais avec des features. */
export const IDEA_OPERATION_KINDS = [
  "idea.page.write",
  "idea.page.delete",
  "idea.index.write",
  "idea.synthesis.write",
  "idea.version.tag",
] as const;

/** Migration v1 -> v2 (TK-106) et son retour arrière : un lot n'en porte qu'une seule, jamais mêlée à d'autres opérations. */
export const MIGRATION_OPERATION_KINDS = ["spec.migrate", "spec.migrate.revert"] as const;

export const isMigrationKind = (kind: string): boolean =>
  (MIGRATION_OPERATION_KINDS as readonly string[]).includes(kind);

/** Identifiant d'un lot (UUID) visé par le retour arrière, `undefined` si le payload n'en porte pas un. */
export function migrationBatchIdOf(payload: BatchOperation["payload"]): string | undefined {
  const id = payload.migrationBatchId;
  return typeof id === "string" && UUID.test(id) ? id : undefined;
}

export const isIdeaKind = (kind: string): boolean =>
  (IDEA_OPERATION_KINDS as readonly string[]).includes(kind);

/** Chemins du dossier `idea/` (relatifs à la racine de la spec) : le nom de fichier est le slug, sans numéro. */
export const IDEA_INDEX_PATH = "idea/_index.yaml";
export const IDEA_SYNTHESIS_PATH = "idea/_synthese.md";
export const ideaPagePath = (slug: string): string => `idea/${slug}.md`;

/** Slug du titre pour un nom de fichier : repli `feature` (ou `fallback`). */
export const slugOf = (title: unknown, fallback = "feature"): string => slugTitle(title, fallback);

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

function ideaOperationProblem(operation: BatchOperation): string | undefined {
  const { kind, payload } = operation;
  if (kind === "idea.page.delete") {
    return ideaDeleteSlug(payload) === undefined ? "slug" : undefined;
  }
  if (kind === "idea.version.tag")
    return ideaTagName(payload) === undefined ? "payload" : undefined;
  if (kind === "idea.synthesis.write") {
    return ideaSynthesisPayload(payload) === undefined ? "payload" : undefined;
  }
  if (!ideaSlugOk(kind, payload)) return "slug";
  const valid = kind === "idea.page.write" ? ideaPagePayload(payload) : ideaIndexPayload(payload);
  return valid === undefined ? "payload" : undefined;
}

/** Un slug douteux (hors `^[a-z0-9-]{1,40}$`) est signalé « slug » plutôt que « payload ». */
function ideaSlugOk(kind: string, payload: Record<string, unknown>): boolean {
  return kind !== "idea.page.write" || ideaDeleteSlug(payload) !== undefined;
}

function migrationProblem(operation: BatchOperation, alone: boolean): string | undefined {
  if (!alone || !isMigrationKind(operation.kind)) return "kind";
  if (operation.kind === "spec.migrate") return undefined;
  return migrationBatchIdOf(operation.payload) === undefined ? "payload" : undefined;
}

function operationProblem(
  operation: BatchOperation,
  lot: { idea: boolean; migration: boolean; alone: boolean },
): string | undefined {
  if (lot.migration || isMigrationKind(operation.kind)) {
    return migrationProblem(operation, lot.migration && lot.alone);
  }
  const ideaLot = lot.idea;
  if (isIdeaKind(operation.kind)) return ideaLot ? ideaOperationProblem(operation) : "kind";
  if (ideaLot) return "kind";
  if (!(OPERATION_KINDS as readonly string[]).includes(operation.kind)) return "kind";
  const pattern = TARGET_ID[operation.kind.split(".")[0] ?? ""];
  if (pattern !== undefined)
    return pattern.test(operation.targetSpecId ?? "") ? undefined : "specId";
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
  const lot = {
    idea: batch.operations.some((operation) => isIdeaKind(operation.kind)),
    migration: batch.operations.some((operation) => isMigrationKind(operation.kind)),
    alone: batch.operations.length === 1,
  };
  // Un lot ne pose jamais deux tags : un seul commit, une seule version.
  if (batch.operations.filter((operation) => operation.kind === "idea.version.tag").length > 1) {
    return "payload";
  }
  for (const operation of batch.operations) {
    const problem = operationProblem(operation, lot);
    if (problem) return problem;
  }
  return undefined;
}
