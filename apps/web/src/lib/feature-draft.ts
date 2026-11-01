import type { FeatureFormValues } from "./feature-form.ts";

/**
 * Brouillon (7 jours) et marqueur de suivi (24 h) en `localStorage`, sans jamais lever : l'écran fonctionne sans.
 * Ils ne contiennent que la saisie (jamais de jeton ni de secret) et sont effacés à la déconnexion.
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
  kind: "create" | "update";
  specId?: string;
  title: string;
  savedAt: string;
}

/** `target` : `new` ou `F-nnn`. */
export const draftKey = (projectId: string, target: string): string =>
  `${DRAFT_PREFIX}${projectId}:${target}`;
export const pendingKey = (projectId: string): string => `${PENDING_PREFIX}${projectId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function write(key: string, value: unknown): boolean {
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

/** Lit un objet JSON valide, non expiré ; sinon `null` et la clé est supprimée. */
function read<T>(
  key: string,
  now: number,
  ttl: number,
  valid: (data: Record<string, unknown>) => boolean,
): T | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const data = parse(raw);
  const savedAt =
    isRecord(data) && typeof data.savedAt === "string" ? Date.parse(data.savedAt) : NaN;
  if (!isRecord(data) || Number.isNaN(savedAt) || now - savedAt > ttl || !valid(data)) {
    remove(key);
    return null;
  }
  return data as T;
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const saveDraft = (projectId: string, target: string, draft: FeatureDraft): boolean =>
  write(draftKey(projectId, target), draft);

export const readDraft = (
  projectId: string,
  target: string,
  now: number = Date.now(),
): FeatureDraft | null =>
  read<FeatureDraft>(draftKey(projectId, target), now, DRAFT_TTL_MS, (data) =>
    isRecord(data.values),
  );

export const clearDraft = (projectId: string, target: string): void =>
  remove(draftKey(projectId, target));

/** Déconnexion : efface tous les brouillons et marqueurs de suivi de l'appareil. */
export function clearAllFeatureStorage(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) {
      if (key?.startsWith(DRAFT_PREFIX) || key?.startsWith(PENDING_PREFIX)) remove(key);
    }
  } catch {
    // stockage indisponible : rien à effacer
  }
}

export const savePending = (projectId: string, pending: PendingSave): boolean =>
  write(pendingKey(projectId), pending);

export const readPending = (projectId: string, now: number = Date.now()): PendingSave | null =>
  read<PendingSave>(
    pendingKey(projectId),
    now,
    PENDING_TTL_MS,
    (data) => typeof data.batchId === "string",
  );

export const clearPending = (projectId: string): void => remove(pendingKey(projectId));
