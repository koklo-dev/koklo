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

  /** Crée un projet dans l'organisation de la session. */
  async create(organizationId: string, name: string): Promise<ProjectListOutput[number]> {
    const { id } = await this.repository.create(organizationId, name);
    return { id, name };
  }
}
