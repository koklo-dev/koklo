import { canonicalize } from "@koklo/schema";
import type { BatchRecord, PreparedBatch, PreparedOperation } from "./spec-batch.repository.ts";

const same = (left: unknown, right: unknown): boolean =>
  canonicalize(JSON.parse(JSON.stringify(left))) ===
  canonicalize(JSON.parse(JSON.stringify(right)));

/** Une création n'a pas encore d'identifiant côté client : seuls son type et ses champs comptent. */
function sameOperation(stored: BatchRecord["operations"][number], asked: PreparedOperation) {
  return (
    stored.kind === asked.kind &&
    (asked.specId === null || stored.specId === asked.specId) &&
    same(stored.payload, asked.payload)
  );
}

/**
 * Le rejeu d'une clé d'idempotence est « à l'identique » quand la branche, la base attendue, le
 * message et les opérations (dans l'ordre) sont les mêmes que ceux du lot enregistré.
 */
export function sameContent(record: BatchRecord, asked: PreparedBatch): boolean {
  return (
    record.branch === asked.branch &&
    record.baseSha === asked.baseSha &&
    record.message === asked.message &&
    record.operations.length === asked.operations.length &&
    record.operations.every((stored, index) => {
      const operation = asked.operations[index];
      return operation !== undefined && sameOperation(stored, operation);
    })
  );
}

/**
 * Rejeu d'un enregistrement pré-vérifié (`skipConflicts`, TK-114e) : la pré-vérification n'est pas refaite (la branche a
 * changé depuis), l'entrée est réduite aux opérations du lot enregistré quand elles en forment une sous-suite, dans l'ordre ;
 * sinon elle est rendue entière et la clé sera tenue pour réutilisée.
 */
export function replayedSubset(record: BatchRecord, asked: PreparedBatch): PreparedBatch {
  const operations: PreparedOperation[] = [];
  for (const operation of asked.operations) {
    const stored = record.operations[operations.length];
    if (stored !== undefined && sameOperation(stored, operation)) operations.push(operation);
  }
  return operations.length === record.operations.length ? { ...asked, operations } : asked;
}
