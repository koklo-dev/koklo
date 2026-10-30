import type { SprintStore } from "../sprint/sprint.repository.ts";
import type { TicketStore } from "../ticket/ticket.repository.ts";
import type { ProjectScope } from "../tracker/scope.ts";

export const SPRINT_IMPORT_REPOSITORY = Symbol("SPRINT_IMPORT_REPOSITORY");

/** Les deux ports d'écriture partagent UNE transaction : un sprint inséré est visible des tickets. */
export interface ImportStores {
  tickets: TicketStore;
  sprints: SprintStore;
}

/** Port de l'import : `work` s'exécute dans une seule transaction (écritures et audit ensemble). */
export interface SprintImportRepository {
  run<T>(scope: ProjectScope, work: (stores: ImportStores) => Promise<T>): Promise<T>;
}
