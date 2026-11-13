import type { PreparedBatch } from "../spec-batch/spec-batch.repository.ts";

/**
 * Lot de migration du format de spec (TK-106) : une seule opération, sans cible (aucun F-nnn), exécutée par le worker.
 * `spec.migrate` n'a pas de payload ; `spec.migrate.revert` vise le lot de la migration à annuler.
 */
export const MIGRATION_OPERATION_KINDS = ["spec.migrate", "spec.migrate.revert"];

export const isMigrationOperation = (kind: string): boolean =>
  MIGRATION_OPERATION_KINDS.includes(kind);

export function buildMigrationBatch(
  idempotencyKey: string,
  branch: string,
  operation: { kind: string; payload: Record<string, unknown> },
): PreparedBatch {
  return {
    idempotencyKey,
    branch,
    baseSha: null,
    message: null,
    operations: [{ kind: operation.kind, specId: null, payload: operation.payload }],
  };
}
