import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import type { ProjectPolicyStore } from "./project-policy.ts";

@Injectable()
export class PrismaProjectPolicy implements ProjectPolicyStore {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async euOnly(organizationId: string, projectId: string): Promise<boolean> {
    const project = await withOrganization(organizationId, () =>
      this.database.client.project.findFirst({
        where: { id: projectId },
        select: { euOnly: true },
      }),
    );
    return project === null ? true : project.euOnly;
  }
}
