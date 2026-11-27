import {
  SECURITY_OPERATION_KINDS,
  type SpecBatchSubmitInput,
  TECHNICAL_OPERATION_KINDS,
} from "@koklo/contract";
import { isValidBranchName, SCOPING_BRANCH } from "@koklo/domain";
import { findSecretPaths, SECRET_REFUSAL_MESSAGE, technicalTraceIn } from "@koklo/schema";
import { validation } from "../tracker/api-errors.ts";
import type { PreparedBatch, PreparedOperation } from "./spec-batch.repository.ts";

type Operation = SpecBatchSubmitInput["operations"][number];

/** Cahier technique (TK-115) et Sécurité (TK-117) : leurs opérations et les sections de leur document. */
const RESTRICTED_KINDS: readonly string[] = [
  ...TECHNICAL_OPERATION_KINDS,
  ...SECURITY_OPERATION_KINDS,
];
const RESTRICTED_DOCUMENTS: readonly unknown[] = ["technical", "security"];

/** Opération réservée à owner, admin et développeur. */
export const isRestrictedOperation = (operation: Operation): boolean =>
  RESTRICTED_KINDS.includes(operation.kind) ||
  ("deliverable" in operation && RESTRICTED_DOCUMENTS.includes(operation.deliverable));

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

/**
 * Deux documents peuvent porter le même identifiant `DOC-`, et une donnée `table.champ` le nom d'une opération : la clé
 * distingue le document et le genre d'une donnée.
 */
const targetKeyOf = ({ kind, specId, payload }: PreparedOperation): string => {
  if (RESTRICTED_DOCUMENTS.includes(payload.deliverable)) return `${payload.deliverable}:${specId}`;
  return kind.startsWith("sensitive.") ? `sensitive:${specId}` : String(specId);
};

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

/** Cartes du résumé client : jamais d'identifiant, de chemin ni d'empreinte (modèle de menace 3). */
function assertPlainSummary(operations: readonly PreparedOperation[]) {
  operations.forEach(({ kind, payload }, i) => {
    if (kind !== "summary.update") return;
    const traced = Object.entries(payload).find(
      ([, value]) => typeof value === "string" && technicalTraceIn(value),
    );
    if (traced) {
      throw validation(
        `operations.${i}.${traced[0]}`,
        "Aucun identifiant technique dans le résumé.",
      );
    }
  });
}

/**
 * Aucune conservation ne vient de l'agent (A7, B796) : un lot qui porte des propositions n'en pose pas ; elle se saisit
 * ensuite dans la feuille.
 */
function assertNoProposedRetention(input: SpecBatchSubmitInput) {
  if (!input.proposalIds?.length) return;
  input.operations.forEach((operation, i) => {
    if ("retention" in operation && operation.retention !== undefined) {
      throw validation(
        `operations.${i}.retention`,
        "La durée de conservation se saisit à la main, jamais depuis une proposition.",
      );
    }
  });
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
  assertPlainSummary(operations);
  assertNoProposedRetention(input);
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
