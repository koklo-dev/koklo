import type { ProjectListOutput } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import type { AuditActor } from "../tracker/audit.ts";
import { PROJECT_REPOSITORY, type ProjectRepository } from "./project.repository.ts";

@Injectable()
export class ProjectService {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly repository: ProjectRepository) {}

  /** Projets de l'organisation, projetés sur le schéma du contrat. */
  async list(organizationId: string): Promise<ProjectListOutput> {
    const projects = await this.repository.listByOrganization(organizationId);
    return projects.map(({ id, name }) => ({ id, name }));
  }

  /** Crée un projet dans l'organisation de la session (journalisé par le dépôt). */
  async create(actor: AuditActor, name: string): Promise<ProjectListOutput[number]> {
    const { id } = await this.repository.create(actor, name);
    return { id, name };
  }
}
