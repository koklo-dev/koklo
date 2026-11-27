import { Module } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { SpecArchitectureModule } from "../spec-architecture/spec-architecture.module.ts";
import { SpecBatchModule } from "../spec-batch/spec-batch.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSpecTechnicalRepository } from "./prisma-spec-technical.repository.ts";
import { PrismaSpecTechnicalApiRepository } from "./prisma-spec-technical-api.repository.ts";
import { SpecTechnicalController } from "./spec-technical.controller.ts";
import { SPEC_TECHNICAL_REPOSITORY } from "./spec-technical.repository.ts";
import { SpecTechnicalService } from "./spec-technical.service.ts";
import { SpecTechnicalApiController } from "./spec-technical-api.controller.ts";
import { SPEC_TECHNICAL_API_REPOSITORY } from "./spec-technical-api.repository.ts";
import { SpecTechnicalApiService } from "./spec-technical-api.service.ts";

/** Page Technique : stack, environnements, document et « Choisir » (TK-115) ; API, contrat et exigences (TK-116). */
@Module({
  imports: [TrackerModule, SpecReadModule, SpecBatchModule, SpecArchitectureModule],
  controllers: [SpecTechnicalController, SpecTechnicalApiController],
  providers: [
    SpecTechnicalService,
    GitAccess,
    { provide: SPEC_TECHNICAL_REPOSITORY, useClass: PrismaSpecTechnicalRepository },
    SpecTechnicalApiService,
    { provide: SPEC_TECHNICAL_API_REPOSITORY, useClass: PrismaSpecTechnicalApiRepository },
  ],
  exports: [SpecTechnicalService, SpecTechnicalApiService],
})
export class SpecTechnicalModule {}
