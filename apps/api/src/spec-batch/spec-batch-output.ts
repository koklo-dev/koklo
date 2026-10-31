import type { SpecBatchOutput } from "@koklo/contract";
import { ORPCError } from "@orpc/server";
import type { BatchRecord } from "./spec-batch.repository.ts";

export const isOpen = (status: BatchRecord["status"]): boolean =>
  status === "queued" || status === "committing";

/** Sortie du contrat : positions en base 0 (base 1 en base de données), jamais l'auteur interne. */
export const outputOf = (record: BatchRecord): SpecBatchOutput => ({
  id: record.id,
  branch: record.branch,
  status: record.status,
  idempotencyKey: record.idempotencyKey,
  baseSha: record.baseSha,
  commitSha: record.commitSha,
  errorCode: record.errorCode,
  report: record.report as SpecBatchOutput["report"],
  results: record.operations.map((operation) => ({
    position: operation.position - 1,
    kind: operation.kind as SpecBatchOutput["results"][number]["kind"],
    specId: operation.specId,
  })),
  enqueuedAt: record.enqueuedAt.toISOString(),
  committedAt: record.committedAt?.toISOString() ?? null,
});

export const reusedKey = (batchId: string) =>
  new ORPCError("SPEC_BATCH_CONFLICT", { data: { reason: "idempotency_key_reused", batchId } });

/**
 * Erreur typée d'un lot terminé en échec ou en conflit (`error_code` est une liste fermée écrite
 * par le worker). Un code inconnu ou `INTERNAL` n'est pas un résultat métier : erreur interne.
 */
export function failureOf(record: BatchRecord): unknown {
  switch (record.errorCode) {
    case "SPEC_INVALID":
      return new ORPCError("SPEC_INVALID", {
        data: { report: record.report as NonNullable<SpecBatchOutput["report"]> },
      });
    case "FORBIDDEN":
      return new ORPCError("FORBIDDEN", { message: "Accès refusé" });
    case "PROVIDER_UNAVAILABLE":
      return new ORPCError("PROVIDER_UNAVAILABLE");
    case "PROVIDER_AUTH_EXPIRED":
      return new ORPCError("PROVIDER_AUTH_EXPIRED", {
        data: { kind: "installation", refreshable: false },
      });
    case "PROVIDER_RATE_LIMITED":
      return new ORPCError("PROVIDER_RATE_LIMITED", { data: {} });
    case "stale_base":
    case "write_conflict":
      return new ORPCError("SPEC_BATCH_CONFLICT", {
        data: { reason: record.errorCode, batchId: record.id },
      });
    default:
      return new Error(`spec batch ${record.id} failed`);
  }
}
