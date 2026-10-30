import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSprintImportRepository } from "./prisma-sprint-import.repository.ts";
import { SPRINT_IMPORT_REPOSITORY } from "./sprint-import.repository.ts";
import { SprintImportService } from "./sprint-import.service.ts";

/** Import ponctuel du backlog Shipyard : un service pour la commande d'administration, aucune route. */
@Module({
  imports: [TrackerModule],
  providers: [
    SprintImportService,
    { provide: SPRINT_IMPORT_REPOSITORY, useClass: PrismaSprintImportRepository },
  ],
  exports: [SprintImportService],
})
export class SprintImportModule {}
