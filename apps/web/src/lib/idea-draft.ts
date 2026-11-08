import {
  IDEA_DRAFT_PREFIX,
  readStored,
  removeStored,
  type StorageScope,
  withOwner,
  writeStored,
} from "./feature-draft.ts";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Copie locale d'une page : la saisie non enregistrée, la version sur laquelle elle repose et l'heure. */
export interface IdeaDraft {
  contentMd: string;
  baseVersion: number;
  savedAt: string;
}

const key = (projectId: string, pageId: string): string =>
  `${IDEA_DRAFT_PREFIX}${projectId}:${pageId}`;

const isDraft = (data: Record<string, unknown>): boolean =>
  typeof data.contentMd === "string" && typeof data.baseVersion === "number";

/** Cloisonnée par compte, organisation et projet (comme les brouillons de fonctionnalité) ; sans portée, rien n'est écrit. */
export function saveIdeaDraft(
  scope: StorageScope | null,
  projectId: string,
  pageId: string,
  draft: Omit<IdeaDraft, "savedAt">,
  now: Date = new Date(),
): boolean {
  if (!scope) return false;
  return writeStored(
    key(projectId, pageId),
    withOwner(scope, { ...draft, savedAt: now.toISOString() }),
  );
}

export const readIdeaDraft = (
  scope: StorageScope | null,
  projectId: string,
  pageId: string,
  now: number = Date.now(),
): IdeaDraft | null =>
  readStored(key(projectId, pageId), scope, now, TTL_MS, isDraft) as IdeaDraft | null;

export const clearIdeaDraft = (projectId: string, pageId: string): void =>
  removeStored(key(projectId, pageId));
