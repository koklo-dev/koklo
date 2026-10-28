import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import type { ProjectRecord, ProjectRepository } from "./project.repository.ts";

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  listByOrganization(organizationId: string): Promise<ProjectRecord[]> {
    // Le filtre `organizationId` est injecté par l'extension multi-tenant.
    return withOrganization(organizationId, () =>
      this.database.client.project.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, organizationId: true, createdAt: true },
      }),
    );
  }
}
