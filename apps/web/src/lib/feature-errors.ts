import type { Role, ValidationReport } from "@koklo/contract";

/**
 * Squelette Red (TK-48 / 48e) : table unique des échecs d'enregistrement (S-feature-form §4.7), pour l'erreur
 * de `specBatch.submit` comme pour un lot terminal relu par `specBatch.get`.
 */
export type SaveFailure =
  | { source: "submit"; error: unknown }
  | {
      source: "batch";
      batch: { status: string; errorCode: string | null; report?: ValidationReport | null };
    };

export type SaveErrorKind =
  | "network"
  | "internal"
  | "unavailable"
  | "rate-limited"
  | "auth-expired"
  | "forbidden"
  | "forbidden-designer"
  | "not-found"
  | "spec-invalid"
  | "stale-base"
  | "write-conflict"
  | "key-reused"
  | "validation"
  | "generic";
export type SaveErrorAction =
  | "retry"
  | "check-list"
  | "reload"
  | "goto-links"
  | "close"
  | "github"
  | "projects";

export interface SaveErrorView {
  kind: SaveErrorKind;
  title: string;
  text: string;
  actions: SaveErrorAction[];
  /** Le prochain envoi prépare une nouvelle clé d'idempotence (faux seulement pour une absence de réponse). */
  freshKey: boolean;
  /** Lien `/github` proposé (propriétaire et administrateur seulement). */
  githubLink: boolean;
  /** `INTERNAL` : référence à montrer à l'équipe. */
  requestId?: string;
  /** `VALIDATION` : champ du serveur. */
  field?: string;
  /** `SPEC_INVALID` : diagnostics (100 au plus) et indicateur de troncature. */
  report?: ValidationReport;
}

export interface SaveErrorContext {
  role: Role | undefined;
  mode: "create" | "update";
}

export function describeSaveError(
  _failure: SaveFailure,
  _context: SaveErrorContext,
): SaveErrorView {
  throw new Error("describeSaveError : non implémenté");
}
