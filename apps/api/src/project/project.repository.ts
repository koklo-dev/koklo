export const PROJECT_REPOSITORY = Symbol("PROJECT_REPOSITORY");

export interface ProjectRecord {
  id: string;
  name: string;
  organizationId: string;
  createdAt: Date;
}

/**
 * Port des projets. Aucune méthode ne liste sans organisation : l'isolation
 * entre tenants (CDC §18.4) tient à cette signature.
 */
export interface ProjectRepository {
  /** Projets de l'organisation, triés par `createdAt` puis `id` croissants. */
  listByOrganization(organizationId: string): Promise<ProjectRecord[]>;
  /** Crée un projet dans l'organisation donnée (jamais celle d'une entrée client). */
  create(organizationId: string, name: string): Promise<ProjectRecord>;
}
