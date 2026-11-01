import { isDraft, isPending, isRecord } from "./feature-draft-schema.ts";
import type { FeatureFormValues } from "./feature-form.ts";

/**
 * Brouillon (7 jours) et marqueur de suivi (24 h) en `localStorage`, sans jamais lever : l'écran fonctionne sans.
 * Ils ne contiennent que la saisie (jamais de jeton ni de secret), portent leur propriétaire (utilisateur et
 * organisation) et sont effacés à la déconnexion ou quand la session se termine. Un contenu d'un autre compte,
 * d'une autre organisation ou mal formé est supprimé à la lecture.
 */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFT_PREFIX = "koklo:feature-draft:";
const PENDING_PREFIX = "koklo:feature-pending:";

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
  kind: "create" | "update" | "delete";
  specId?: string;
  title: string;
  savedAt: string;
}

/** Propriétaire des données locales : le compte connecté et son organisation active. */
export interface StorageScope {
  userId: string;
  organizationId: string;
}
type Scope = StorageScope | null;

/** `target` : `new` ou `F-nnn`. */
export const draftKey = (projectId: string, target: string): string =>
  `${DRAFT_PREFIX}${projectId}:${target}`;
export const pendingKey = (projectId: string): string => `${PENDING_PREFIX}${projectId}`;

/** Vrai une fois la session terminée : plus rien n'est écrit (le démontage d'un formulaire ne réécrit pas). */
let sessionEnded = false;

function write(key: string, value: unknown): boolean {
  if (sessionEnded) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // stockage indisponible : rien à effacer
  }
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const owned = (data: Record<string, unknown>, scope: StorageScope): boolean =>
  data.ownerId === scope.userId && data.organizationId === scope.organizationId;

/** Lit un objet JSON valide, non expiré, de ce propriétaire ; sinon `null` et la clé est supprimée. */
function read(
  key: string,
  scope: Scope,
  now: number,
  ttl: number,
  valid: (data: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  if (!scope) return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const data = parse(raw);
  const savedAt =
    isRecord(data) && typeof data.savedAt === "string" ? Date.parse(data.savedAt) : Number.NaN;
  if (!isRecord(data) || Number.isNaN(savedAt) || now - savedAt > ttl) return discard(key);
  if (!owned(data, scope) || !valid(data)) return discard(key);
  const { ownerId: _owner, organizationId: _organization, ...content } = data;
  return content;
}

function discard(key: string): null {
  remove(key);
  return null;
}

const withOwner = (scope: StorageScope, value: object) => ({
  ...value,
  ownerId: scope.userId,
  organizationId: scope.organizationId,
});

export const saveDraft = (
  scope: Scope,
  projectId: string,
  target: string,
  draft: FeatureDraft,
): boolean => (scope ? write(draftKey(projectId, target), withOwner(scope, draft)) : false);

export const readDraft = (
  scope: Scope,
  projectId: string,
  target: string,
  now: number = Date.now(),
): FeatureDraft | null =>
  read(draftKey(projectId, target), scope, now, DRAFT_TTL_MS, isDraft) as FeatureDraft | null;

export const clearDraft = (projectId: string, target: string): void =>
  remove(draftKey(projectId, target));

function removeWhere(drop: (key: string, data: unknown) => boolean): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) {
      if (!key?.startsWith(DRAFT_PREFIX) && !key?.startsWith(PENDING_PREFIX)) continue;
      if (drop(key, parse(localStorage.getItem(key) ?? ""))) remove(key);
    }
  } catch {
    // stockage indisponible : rien à effacer
  }
}

/** Efface tous les brouillons et marqueurs de suivi de l'appareil. */
export function clearAllFeatureStorage(): void {
  removeWhere(() => true);
}

/** Fin de session (déconnexion, session expirée) : tout est effacé et plus rien n'est écrit jusqu'à la suivante. */
export function endFeatureSession(): void {
  sessionEnded = true;
  clearAllFeatureStorage();
}

/** Début de session pour ce compte et cette organisation : le contenu des autres est effacé. */
export function beginFeatureSession(scope: StorageScope): void {
  sessionEnded = false;
  removeWhere((_key, data) => !isRecord(data) || !owned(data, scope));
}

export const savePending = (scope: Scope, projectId: string, pending: PendingSave): boolean =>
  scope ? write(pendingKey(projectId), withOwner(scope, pending)) : false;

export const readPending = (
  scope: Scope,
  projectId: string,
  now: number = Date.now(),
): PendingSave | null =>
  read(pendingKey(projectId), scope, now, PENDING_TTL_MS, isPending) as PendingSave | null;

export const clearPending = (projectId: string): void => remove(pendingKey(projectId));
