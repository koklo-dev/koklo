import { Module } from "@nestjs/common";
import { SpecBatchModule } from "../spec-batch/spec-batch.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { IdeaController } from "./idea.controller.ts";
import { IDEA_REPOSITORY } from "./idea.repository.ts";
import { IdeaService } from "./idea.service.ts";
import { PrismaIdeaRepository } from "./prisma-idea.repository.ts";

@Module({
  imports: [TrackerModule, SpecBatchModule],
  controllers: [IdeaController],
  providers: [IdeaService, { provide: IDEA_REPOSITORY, useClass: PrismaIdeaRepository }],
})
export class IdeaModule {}
