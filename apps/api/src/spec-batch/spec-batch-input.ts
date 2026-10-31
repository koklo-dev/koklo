import type { SpecBatchSubmitInput } from "@koklo/contract";
import { isValidBranchName, SCOPING_BRANCH } from "@koklo/domain";
import { validation } from "../tracker/api-errors.ts";
import type { PreparedBatch, PreparedOperation } from "./spec-batch.repository.ts";

type Operation = SpecBatchSubmitInput["operations"][number];

/** Saut de ligne, NUL ou séparateur Unicode de ligne : le texte sortirait de sa ligne dans l'historique git. */
const hasLineBreak = (text: string): boolean =>
  [...text].some((char) => "\r\n\0\u2028\u2029".includes(char));

/** Branche de travail : celle du lot, sinon `cadrage` ; jamais la branche par défaut du dépôt (H3). */
function branchOf(requested: string | undefined, defaultBranch: string): string {
  const branch = requested ?? SCOPING_BRANCH;
  if (!isValidBranchName(branch)) {
    throw validation("branch", "Nom de branche invalide.");
  }
  if (branch === defaultBranch) {
    throw validation(
      "branch",
      "Écriture directe sur la branche par défaut refusée : la spec évolue sur une branche de travail.",
    );
  }
  return branch;
}

function operationOf(operation: Operation): PreparedOperation {
  const { kind, ...fields } = operation;
  const { specId, ...payload } = fields as { specId?: string } & Record<string, unknown>;
  return { kind, specId: kind === "feature.create" ? null : (specId ?? null), payload };
}

/** Une seule opération par feature dans un lot : l'ordre n'a de sens qu'entre fichiers distincts. */
function assertDistinctTargets(operations: readonly PreparedOperation[]): void {
  const seen = new Set<string>();
  for (const { specId } of operations) {
    if (specId === null) continue;
    if (seen.has(specId)) {
      throw validation("operations", `Plusieurs opérations sur ${specId} dans le même lot.`);
    }
    seen.add(specId);
  }
}

/**
 * Entrées contrôlées avant toute écriture : branche, objet du commit sur une seule ligne (il
 * finit dans l'historique git), une opération par feature. L'auteur et les trailers ne viennent
 * jamais de l'entrée.
 */
export function prepareBatch(input: SpecBatchSubmitInput, defaultBranch: string): PreparedBatch {
  const branch = branchOf(input.branch, defaultBranch);
  if (input.message !== undefined && hasLineBreak(input.message)) {
    throw validation("message", "Le message du commit tient sur une seule ligne.");
  }
  const operations = input.operations.map(operationOf);
  assertDistinctTargets(operations);
  return {
    idempotencyKey: input.idempotencyKey,
    branch,
    baseSha: input.baseSha ?? null,
    message: input.message ?? null,
    operations,
  };
}
