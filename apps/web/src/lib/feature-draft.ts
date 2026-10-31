import type { FeatureFormValues } from "./feature-form.ts";

/** Squelette Red (TK-48 / 48e) : brouillon (7 jours) et marqueur de suivi (24 h) en `localStorage`, sans jamais lever. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAFT_PREFIX = "koklo:feature-draft:";
export const PENDING_PREFIX = "koklo:feature-pending:";

export interface FeatureDraft {
  values: FeatureFormValues;
  /** Valeurs lues à l'ouverture (modification) ; `null` en création. */
  baseline: FeatureFormValues | null;
  /** `commitSha` de la fiche lue à l'ouverture ; `null` en création. */
  baseCommitSha: string | null;
  idempotencyKey: string | null;
  /** Date ISO de la dernière sauvegarde. */
  savedAt: string;
}
export interface PendingSave {
  batchId: string;
  kind: "create" | "update";
  specId?: string;
  title: string;
  savedAt: string;
}

/** `target` : `new` ou `F-nnn`. */
export const draftKey = (projectId: string, target: string): string =>
  `${DRAFT_PREFIX}${projectId}:${target}`;
export const pendingKey = (projectId: string): string => `${PENDING_PREFIX}${projectId}`;

export function saveDraft(_projectId: string, _target: string, _draft: FeatureDraft): boolean {
  throw new Error("saveDraft : non implémenté");
}
export function readDraft(
  _projectId: string,
  _target: string,
  _now: number = Date.now(),
): FeatureDraft | null {
  throw new Error("readDraft : non implémenté");
}
export function clearDraft(_projectId: string, _target: string): void {
  throw new Error("clearDraft : non implémenté");
}
/** Déconnexion : efface tous les brouillons et marqueurs de suivi de l'appareil. */
export function clearAllFeatureStorage(): void {
  throw new Error("clearAllFeatureStorage : non implémenté");
}
export function savePending(_projectId: string, _pending: PendingSave): boolean {
  throw new Error("savePending : non implémenté");
}
export function readPending(_projectId: string, _now: number = Date.now()): PendingSave | null {
  throw new Error("readPending : non implémenté");
}
export function clearPending(_projectId: string): void {
  throw new Error("clearPending : non implémenté");
}
