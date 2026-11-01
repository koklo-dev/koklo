import { Module } from "@nestjs/common";
import { GitAccess } from "../repo/git-access.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSpecReadRepository } from "./prisma-spec-read.repository.ts";
import { SpecReadController } from "./spec-read.controller.ts";
import { SPEC_READ_REPOSITORY } from "./spec-read.repository.ts";
import { SpecReadService } from "./spec-read.service.ts";

@Module({
  imports: [TrackerModule],
  controllers: [SpecReadController],
  providers: [
    SpecReadService,
    GitAccess,
    { provide: SPEC_READ_REPOSITORY, useClass: PrismaSpecReadRepository },
  ],
  exports: [SpecReadService],
})
export class SpecReadModule {}
