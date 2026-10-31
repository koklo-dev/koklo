import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSpecBatchRepository } from "./prisma-spec-batch.repository.ts";
import { SpecBatchController } from "./spec-batch.controller.ts";
import { SPEC_BATCH_REPOSITORY } from "./spec-batch.repository.ts";
import { SpecBatchService } from "./spec-batch.service.ts";
import { SpecWriteQueue } from "./spec-write.queue.ts";

@Module({
  imports: [TrackerModule],
  controllers: [SpecBatchController],
  providers: [
    SpecBatchService,
    SpecWriteQueue,
    { provide: SPEC_BATCH_REPOSITORY, useClass: PrismaSpecBatchRepository },
  ],
})
export class SpecBatchModule {}
