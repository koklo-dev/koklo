import { Module } from "@nestjs/common";
import { PrismaProjectRepository } from "./prisma-project.repository.ts";
import { ProjectController } from "./project.controller.ts";
import { PROJECT_REPOSITORY } from "./project.repository.ts";
import { ProjectService } from "./project.service.ts";

@Module({
  controllers: [ProjectController],
  providers: [ProjectService, { provide: PROJECT_REPOSITORY, useClass: PrismaProjectRepository }],
})
export class ProjectModule {}
