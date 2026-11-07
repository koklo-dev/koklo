import { Module } from "@nestjs/common";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaProjectRepository } from "./prisma-project.repository.ts";
import { PrismaProjectShellRepository } from "./prisma-project-shell.repository.ts";
import { ProjectController } from "./project.controller.ts";
import { PROJECT_REPOSITORY } from "./project.repository.ts";
import { ProjectService } from "./project.service.ts";
import { PROJECT_SHELL_REPOSITORY } from "./project-shell.repository.ts";
import { ProjectShellService } from "./project-shell.service.ts";

@Module({
  imports: [TrackerModule, SpecReadModule],
  controllers: [ProjectController],
  providers: [
    ProjectService,
    ProjectShellService,
    { provide: PROJECT_REPOSITORY, useClass: PrismaProjectRepository },
    { provide: PROJECT_SHELL_REPOSITORY, useClass: PrismaProjectShellRepository },
  ],
})
export class ProjectModule {}
