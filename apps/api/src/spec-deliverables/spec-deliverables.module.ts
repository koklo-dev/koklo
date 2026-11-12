import { Module } from "@nestjs/common";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { DELIVERABLE_STATUS_SOURCE } from "./deliverable-status-source.ts";
import { PrismaSpecDeliverablesRepository } from "./prisma-spec-deliverables.repository.ts";
import { ReviewStatusSource } from "./review-status-source.ts";
import { SpecDeliverablesController } from "./spec-deliverables.controller.ts";
import { SPEC_DELIVERABLES_REPOSITORY } from "./spec-deliverables.repository.ts";
import { SpecDeliverablesService } from "./spec-deliverables.service.ts";

@Module({
  imports: [TrackerModule, SpecReadModule],
  controllers: [SpecDeliverablesController],
  providers: [
    SpecDeliverablesService,
    { provide: SPEC_DELIVERABLES_REPOSITORY, useClass: PrismaSpecDeliverablesRepository },
    { provide: DELIVERABLE_STATUS_SOURCE, useClass: ReviewStatusSource },
  ],
  exports: [SpecDeliverablesService],
})
export class SpecDeliverablesModule {}
