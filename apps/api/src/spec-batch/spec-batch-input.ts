import { type SpecBatchSubmitInput, TECHNICAL_OPERATION_KINDS } from "@koklo/contract";
import { isValidBranchName, SCOPING_BRANCH } from "@koklo/domain";
import { findSecretPaths, SECRET_REFUSAL_MESSAGE } from "@koklo/schema";
import { validation } from "../tracker/api-errors.ts";
import type { PreparedBatch, PreparedOperation } from "./spec-batch.repository.ts";

type Operation = SpecBatchSubmitInput["operations"][number];

/** Opération du cahier technique : choix, opération, exigence, environnement ou section de ce document. */
export const isTechnicalOperation = (operation: Operation): boolean =>
  (TECHNICAL_OPERATION_KINDS as readonly string[]).includes(operation.kind) ||
  ("deliverable" in operation && operation.deliverable === "technical");

/** Saut de ligne, NUL ou séparateur Unicode de ligne : le texte sortirait de sa ligne dans l'historique git. */
const hasLineBreak = (text: string): boolean =>
  [...text].some((char) => "\r\n\0\u2028\u2029".includes(char));

/** Branche de travail : celle du lot, sinon `cadrage` ; jamais la branche par défaut du dépôt (H3). */
export function branchOf(requested: string | undefined, defaultBranch: string): string {
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
  return { kind, specId: kind.endsWith(".create") ? null : (specId ?? null), payload };
}

/** Une section du cahier technique et une section de l'architecture peuvent porter le même identifiant `DOC-`. */
const targetKeyOf = ({ specId, payload }: PreparedOperation): string =>
  `${payload.deliverable === "technical" ? "technical:" : ""}${specId}`;

/** Une seule opération par élément (fonctionnalité, règle, rôle, parcours) dans un lot : l'ordre n'a de sens qu'entre fichiers distincts. */
function assertDistinctTargets(operations: readonly PreparedOperation[]): void {
  const seen = new Set<string>();
  for (const operation of operations) {
    const { specId } = operation;
    if (specId === null) continue;
    const key = targetKeyOf(operation);
    if (seen.has(key)) {
      throw validation("operations", `Plusieurs opérations sur ${specId} dans le même lot.`);
    }
    seen.add(key);
  }
}

/** Champ d'entrée désigné par un pointeur JSON du détecteur : `operations.0.variables.1.usage`. */
const fieldAt = (base: string, pointer: string): string => `${base}${pointer.replaceAll("/", ".")}`;

/** La spec ne contient jamais de valeur de secret (TK-115, B724) : refus avant toute écriture, sans recopier la valeur. */
function assertNoSecret(operations: readonly PreparedOperation[], message: string | undefined) {
  const texts: [string, unknown][] = [
    ...operations.map((operation, i): [string, unknown] => [`operations.${i}`, operation.payload]),
    ["message", message ?? ""],
  ];
  for (const [base, value] of texts) {
    const [pointer] = findSecretPaths(value);
    if (pointer !== undefined) throw validation(fieldAt(base, pointer), SECRET_REFUSAL_MESSAGE);
  }
}

/**
 * `skipConflicts` (TK-114e, B675) : une proposition par opération, chacune dans `proposalIds`, et chaque proposition de
 * `proposalIds` citée (sinon elle serait tenue par un lot qui n'écrit rien pour elle).
 */
function assertSkipConflicts(input: SpecBatchSubmitInput): void {
  const proposals = input.skipConflicts?.proposals;
  if (proposals === undefined) return;
  const allowed = new Set(input.proposalIds ?? []);
  const cited = new Set(proposals);
  if (
    proposals.length !== input.operations.length ||
    proposals.some((id) => !allowed.has(id)) ||
    [...allowed].some((id) => !cited.has(id))
  ) {
    throw validation(
      "skipConflicts",
      "Une proposition par opération, chacune parmi les propositions du lot.",
    );
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
  assertNoSecret(operations, input.message);
  assertDistinctTargets(operations);
  assertSkipConflicts(input);
  return {
    idempotencyKey: input.idempotencyKey,
    branch,
    baseSha: input.baseSha ?? null,
    message: input.message ?? null,
    operations,
    ...(input.proposalIds === undefined ? {} : { proposalIds: [...new Set(input.proposalIds)] }),
  };
}
