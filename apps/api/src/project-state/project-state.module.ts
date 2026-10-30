import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaProjectStateRepository } from "./prisma-project-state.repository.ts";
import { ProjectStateController } from "./project-state.controller.ts";
import { PROJECT_STATE_REPOSITORY } from "./project-state.repository.ts";
import { ProjectStateService } from "./project-state.service.ts";

@Module({
  imports: [TrackerModule],
  controllers: [ProjectStateController],
  providers: [
    ProjectStateService,
    { provide: PROJECT_STATE_REPOSITORY, useClass: PrismaProjectStateRepository },
  ],
})
export class ProjectStateModule {}
