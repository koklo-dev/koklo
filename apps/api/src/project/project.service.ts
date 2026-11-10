import type { ProjectListOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, type ProjectRepository } from "./project.repository.ts";

@Injectable()
export class ProjectService {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly repository: ProjectRepository) {}

  /** Projets de l'organisation, projetés sur le schéma du contrat. */
  async list(organizationId: string): Promise<ProjectListOutput> {
    const projects = await this.repository.listByOrganization(organizationId);
    return projects.map(({ id, name }) => ({ id, name }));
  }

  /**
   * Projets visibles d'une session (TK-55a) : `linkedIds` `null` = toute l'organisation (rôle
   * d'équipe), sinon les seuls projets liés (`[]` : aucun, jamais d'erreur).
   */
  async listVisible(
    organizationId: string,
    linkedIds: readonly string[] | null,
  ): Promise<ProjectListOutput> {
    const projects = await this.list(organizationId);
    if (linkedIds === null) {
      return projects;
    }
    const linked = new Set(linkedIds);
    return projects.filter(({ id }) => linked.has(id));
  }
}
