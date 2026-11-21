import { Module } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { SpecBatchModule } from "../spec-batch/spec-batch.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSpecArchitectureRepository } from "./prisma-spec-architecture.repository.ts";
import { PrismaSpecArchitectureDiagramRepository } from "./prisma-spec-architecture-diagram.repository.ts";
import { SpecArchitectureController } from "./spec-architecture.controller.ts";
import { SPEC_ARCHITECTURE_REPOSITORY } from "./spec-architecture.repository.ts";
import { SpecArchitectureService } from "./spec-architecture.service.ts";
import { SpecArchitectureDiagramController } from "./spec-architecture-diagram.controller.ts";
import { SPEC_ARCHITECTURE_DIAGRAM_REPOSITORY } from "./spec-architecture-diagram.repository.ts";
import { SpecArchitectureDiagramService } from "./spec-architecture-diagram.service.ts";

/**
 * Page Architecture : composants, document et avertissements (TK-111, B506 à B515), schéma en couches, flux et mise en page
 * (TK-112, B541 à B550), lus de l'index d'entités et de git.
 */
@Module({
  imports: [TrackerModule, SpecReadModule, SpecBatchModule],
  controllers: [SpecArchitectureController, SpecArchitectureDiagramController],
  providers: [
    SpecArchitectureService,
    SpecArchitectureDiagramService,
    GitAccess,
    { provide: SPEC_ARCHITECTURE_REPOSITORY, useClass: PrismaSpecArchitectureRepository },
    {
      provide: SPEC_ARCHITECTURE_DIAGRAM_REPOSITORY,
      useClass: PrismaSpecArchitectureDiagramRepository,
    },
  ],
  exports: [SpecArchitectureService, SpecArchitectureDiagramService],
})
export class SpecArchitectureModule {}
