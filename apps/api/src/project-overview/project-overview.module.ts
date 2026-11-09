import { Module } from "@nestjs/common";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaProjectOverviewRepository } from "./prisma-project-overview.repository.ts";
import { ProjectOverviewController } from "./project-overview.controller.ts";
import { PROJECT_OVERVIEW_REPOSITORY } from "./project-overview.repository.ts";
import { ProjectOverviewService } from "./project-overview.service.ts";

@Module({
  imports: [TrackerModule, SpecReadModule],
  controllers: [ProjectOverviewController],
  providers: [
    ProjectOverviewService,
    { provide: PROJECT_OVERVIEW_REPOSITORY, useClass: PrismaProjectOverviewRepository },
  ],
})
export class ProjectOverviewModule {}
