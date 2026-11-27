import { Module } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { SpecArchitectureModule } from "../spec-architecture/spec-architecture.module.ts";
import { SpecBatchModule } from "../spec-batch/spec-batch.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSpecTechnicalRepository } from "./prisma-spec-technical.repository.ts";
import { SpecTechnicalController } from "./spec-technical.controller.ts";
import { SPEC_TECHNICAL_REPOSITORY } from "./spec-technical.repository.ts";
import { SpecTechnicalService } from "./spec-technical.service.ts";

/** Page Technique (TK-115) : stack, environnements, document et « Choisir ». */
@Module({
  imports: [TrackerModule, SpecReadModule, SpecBatchModule, SpecArchitectureModule],
  controllers: [SpecTechnicalController],
  providers: [
    SpecTechnicalService,
    GitAccess,
    { provide: SPEC_TECHNICAL_REPOSITORY, useClass: PrismaSpecTechnicalRepository },
  ],
  exports: [SpecTechnicalService],
})
export class SpecTechnicalModule {}
