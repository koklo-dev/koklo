import type { ProjectScope } from "../tracker/scope.ts";

export const PROJECT_CLIENT_REPOSITORY = Symbol("PROJECT_CLIENT_REPOSITORY");

/** Client lié à un projet : la fiche de son membre et la date de liaison. */
export interface ProjectClientRecord {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  createdAt: Date;
}

/**
 * Port des liens client <-> projet (TK-55a). Toute opération porte la portée de la session ;
 * l'organisation, l'auteur et l'identifiant de ligne ne viennent jamais de l'entrée.
 */
export interface ProjectClientRepository {
  /** Clients liés à ce projet, par date de liaison puis identifiant. */
  list(scope: ProjectScope): Promise<ProjectClientRecord[]>;
  /**
   * Lie un membre `client` au projet (idempotent : un lien présent est renvoyé tel quel, sans
   * audit). `null` si le membre n'existe pas dans l'organisation ou n'a pas le rôle client. Lien
   * et audit `project_client.add` partagent une transaction.
   */
  add(scope: ProjectScope, memberId: string): Promise<ProjectClientRecord | null>;
  /**
   * Supprime le lien de ce projet seulement ; `false` s'il n'existait pas (idempotent, sans audit).
   * Lien et audit `project_client.remove` partagent une transaction.
   */
  remove(scope: ProjectScope, memberId: string): Promise<boolean>;
}
