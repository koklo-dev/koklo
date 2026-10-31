import type { SpecBatchErrorCode } from "@koklo/domain";

/** Statut d'un lot (colonne `write_batch_status`). */
export type BatchStatus = "queued" | "committing" | "committed" | "failed" | "conflict";

export interface BatchOperation {
  /** Position en base (base 1). */
  readonly position: number;
  readonly kind: string;
  readonly targetSpecId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Un lot et tout ce qu'il faut pour l'exécuter, lu en base (jamais le payload de la file). */
export interface LoadedBatch {
  readonly id: string;
  readonly organizationId: string;
  readonly status: BatchStatus;
  readonly branch: string;
  readonly baseSha: string | null;
  readonly message: string | null;
  readonly authorRole: string | null;
  readonly authorUserId: string | null;
  readonly operations: readonly BatchOperation[];
  readonly repo: {
    readonly id: string;
    readonly name: string;
    readonly ownerLogin: string;
    readonly specPath: string | null;
  };
  readonly installation: {
    readonly externalId: string;
    readonly ownerKind: "organization" | "user";
    readonly ownerLogin: string;
  };
}

/** Utilisateur de la session qui a soumis le lot (relu en base, jamais de l'entrée). */
export interface BatchAuthor {
  readonly name: string;
  readonly email: string;
}

export interface ReportIssue {
  readonly rule: 4 | 5 | 7 | "structure";
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly pointer: string;
  readonly entityId?: string;
  readonly message: string;
}

/** Rapport de validation tel que stocké (`report`) et rendu par le contrat. */
export interface StoredReport {
  readonly ok: boolean;
  readonly counts: { readonly error: number; readonly warning: number };
  readonly truncated: boolean;
  readonly issues: readonly ReportIssue[];
}

/** Résultat final d'un lot : écrit sur la ligne, le job termine normalement. */
export type Outcome =
  | { readonly status: "committed"; readonly commitSha: string; readonly report?: StoredReport }
  | {
      readonly status: "failed" | "conflict";
      readonly errorCode: SpecBatchErrorCode;
      readonly report?: StoredReport;
    };

export const failed = (errorCode: SpecBatchErrorCode, report?: StoredReport): Outcome =>
  report ? { status: "failed", errorCode, report } : { status: "failed", errorCode };

export const conflicted = (errorCode: "stale_base" | "write_conflict"): Outcome => ({
  status: "conflict",
  errorCode,
});
