import type { ProjectScope } from "../tracker/scope.ts";

export const PROJECT_STATE_REPOSITORY = Symbol("PROJECT_STATE_REPOSITORY");

export interface ProjectStateRecord {
  id: string;
  version: number;
  content: Record<string, unknown>;
}

/** Opérations d'une transaction sur la ligne unique d'état du projet courant. */
export interface ProjectStateStore {
  /** Lit la ligne ; la crée `{version: 1, content: {}}` si absente (tolérant à la course). */
  ensure(): Promise<ProjectStateRecord>;
  /** `UPDATE … WHERE version = expectedVersion` : `null` si la version n'est plus celle attendue. */
  write(
    expectedVersion: number,
    content: Record<string, unknown>,
  ): Promise<ProjectStateRecord | null>;
  audit(action: string, state: ProjectStateRecord): Promise<void>;
}

export interface ProjectStateRepository {
  run<T>(scope: ProjectScope, work: (store: ProjectStateStore) => Promise<T>): Promise<T>;
}
