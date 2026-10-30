import type { ProjectScope } from "../tracker/scope.ts";

export const SPRINT_REPOSITORY = Symbol("SPRINT_REPOSITORY");

export type SprintStatus = "planned" | "active" | "closed";

export interface SprintRecord {
  id: string;
  key: string;
  goal: string;
  status: SprintStatus;
  /** Date calendaire `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
  definitionOfDone: string;
}

export interface NewSprint {
  number: number;
  goal: string;
  startsOn: string;
  endsOn: string;
  definitionOfDone: string;
}

export type SprintChanges = Partial<
  Pick<SprintRecord, "goal" | "startsOn" | "endsOn" | "definitionOfDone" | "status">
>;

/** Opérations d'une transaction de projet : toutes bornées à l'organisation et au projet de la portée. */
export interface SprintStore {
  /** Numéro suivant du compteur de sprints du projet. */
  nextNumber(): Promise<number>;
  find(key: string): Promise<SprintRecord | null>;
  findActive(): Promise<SprintRecord | null>;
  list(status?: SprintStatus): Promise<SprintRecord[]>;
  insert(sprint: NewSprint): Promise<SprintRecord>;
  update(id: string, changes: SprintChanges): Promise<SprintRecord>;
  audit(action: string, sprintId: string): Promise<void>;
}

/** Port des sprints : `work` s'exécute dans une seule transaction (écriture et audit ensemble). */
export interface SprintRepository {
  run<T>(scope: ProjectScope, work: (store: SprintStore) => Promise<T>): Promise<T>;
}
