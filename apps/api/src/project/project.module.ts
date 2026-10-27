import { Module } from "@nestjs/common";
import { ORGANIZATION_CONTEXT, SessionOrganizationContext } from "./organization-context.ts";
import { PrismaProjectRepository } from "./prisma-project.repository.ts";
import { ProjectController } from "./project.controller.ts";
import { PROJECT_REPOSITORY } from "./project.repository.ts";
import { ProjectService } from "./project.service.ts";

@Module({
  controllers: [ProjectController],
  providers: [
    ProjectService,
    { provide: PROJECT_REPOSITORY, useClass: PrismaProjectRepository },
    { provide: ORGANIZATION_CONTEXT, useClass: SessionOrganizationContext },
  ],
})
export class ProjectModule {}
