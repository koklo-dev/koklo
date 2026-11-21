import { Module } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSpecArchitectureRepository } from "./prisma-spec-architecture.repository.ts";
import { SpecArchitectureController } from "./spec-architecture.controller.ts";
import { SPEC_ARCHITECTURE_REPOSITORY } from "./spec-architecture.repository.ts";
import { SpecArchitectureService } from "./spec-architecture.service.ts";

/** Page Architecture (TK-111) : composants, document et avertissements, lus de l'index d'entités et de git (B506 à B515). */
@Module({
  imports: [TrackerModule, SpecReadModule],
  controllers: [SpecArchitectureController],
  providers: [
    SpecArchitectureService,
    GitAccess,
    { provide: SPEC_ARCHITECTURE_REPOSITORY, useClass: PrismaSpecArchitectureRepository },
  ],
  exports: [SpecArchitectureService],
})
export class SpecArchitectureModule {}
