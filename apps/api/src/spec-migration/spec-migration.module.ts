import { Module } from "@nestjs/common";
import { SpecBatchModule } from "../spec-batch/spec-batch.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { SpecMigrationController } from "./spec-migration.controller.ts";
import { SpecMigrationService } from "./spec-migration.service.ts";

@Module({
  imports: [TrackerModule, SpecBatchModule],
  controllers: [SpecMigrationController],
  providers: [SpecMigrationService],
})
export class SpecMigrationModule {}
