import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSprintRepository } from "./prisma-sprint.repository.ts";
import { SprintController } from "./sprint.controller.ts";
import { SPRINT_REPOSITORY } from "./sprint.repository.ts";
import { SprintService } from "./sprint.service.ts";

@Module({
  imports: [TrackerModule],
  controllers: [SprintController],
  providers: [SprintService, { provide: SPRINT_REPOSITORY, useClass: PrismaSprintRepository }],
})
export class SprintModule {}
