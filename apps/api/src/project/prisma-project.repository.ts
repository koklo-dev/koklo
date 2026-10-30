import { withOrganization } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";
import { type AuditActor, recordAudit } from "../tracker/audit.ts";
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

  create(actor: AuditActor, name: string): Promise<ProjectRecord> {
    // `organizationId` est affecté (et vérifié) par l'extension multi-tenant.
    return withOrganization(actor.organizationId, () =>
      this.database.client.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: { name, organizationId: actor.organizationId },
          select: { id: true, name: true, organizationId: true, createdAt: true },
        });
        await recordAudit(tx, actor, {
          action: "project.create",
          targetKind: "project",
          targetId: project.id,
        });
        return project;
      }),
    );
  }
}
