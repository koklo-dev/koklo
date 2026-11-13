import { Module } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { SpecBatchModule } from "../spec-batch/spec-batch.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSpecDataRepository } from "./prisma-spec-data.repository.ts";
import { SpecDataController } from "./spec-data.controller.ts";
import { SPEC_DATA_REPOSITORY } from "./spec-data.repository.ts";
import { SpecDataService } from "./spec-data.service.ts";

/** Page Données (TK-107) : tables, modèle Mermaid, jeux d'exemple. Lit l'index d'entités, le modèle Mermaid est généré depuis cet index (B476). */
@Module({
  imports: [TrackerModule, SpecReadModule, SpecBatchModule],
  controllers: [SpecDataController],
  providers: [
    SpecDataService,
    GitAccess,
    { provide: SPEC_DATA_REPOSITORY, useClass: PrismaSpecDataRepository },
  ],
  exports: [SpecDataService],
})
export class SpecDataModule {}
