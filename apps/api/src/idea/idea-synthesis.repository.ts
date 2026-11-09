import type { ProjectScope } from "../tracker/scope.ts";
import type { IdeaSynthesisRecord } from "./idea.repository.ts";

export const IDEA_SYNTHESIS_REPOSITORY = Symbol("IDEA_SYNTHESIS_REPOSITORY");

/** Synthèse de l'idée (TK-91) : une ligne par projet, remplacée à chaque génération. */
export interface IdeaSynthesisRepository {
  get(scope: ProjectScope): Promise<IdeaSynthesisRecord | null>;
  /** Étiquette de la dernière version dont le lot est commité, `null` avant la première. */
  latestTag(scope: ProjectScope): Promise<string | null>;
  save(scope: ProjectScope, record: IdeaSynthesisRecord): Promise<void>;
}
