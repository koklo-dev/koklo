import type { ProjectClient } from "@koklo/contract";
import { Inject, Injectable } from "@nestjs/common";
import { validation } from "../tracker/api-errors.ts";
import type { ProjectScope } from "../tracker/scope.ts";
import {
  PROJECT_CLIENT_REPOSITORY,
  type ProjectClientRecord,
  type ProjectClientRepository,
} from "./project-client.repository.ts";

/** Un seul message pour membre non client, d'une autre organisation ou inconnu (aucun oracle). */
const NOT_A_CLIENT = "Le membre doit être un client de l'organisation";

const outputOf = (record: ProjectClientRecord): ProjectClient => ({
  ...record,
  createdAt: record.createdAt.toISOString(),
});

/** Liens client <-> projet (TK-55a) : owner et admin, garde de rôle posée sur le contrôleur. */
@Injectable()
export class ProjectClientService {
  constructor(
    @Inject(PROJECT_CLIENT_REPOSITORY) private readonly repository: ProjectClientRepository,
  ) {}

  async list(scope: ProjectScope): Promise<ProjectClient[]> {
    return (await this.repository.list(scope)).map(outputOf);
  }

  async add(scope: ProjectScope, memberId: string): Promise<ProjectClient> {
    const record = await this.repository.add(scope, memberId);
    if (!record) {
      throw validation("memberId", NOT_A_CLIENT);
    }
    return outputOf(record);
  }

  async remove(scope: ProjectScope, memberId: string): Promise<{ removed: boolean }> {
    return { removed: await this.repository.remove(scope, memberId) };
  }
}
