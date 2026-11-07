import { Module } from "@nestjs/common";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSearchRepository } from "./prisma-search.repository.ts";
import { SearchController } from "./search.controller.ts";
import { SEARCH_REPOSITORY } from "./search.repository.ts";
import { SearchService } from "./search.service.ts";

@Module({
  imports: [TrackerModule, SpecReadModule],
  controllers: [SearchController],
  providers: [SearchService, { provide: SEARCH_REPOSITORY, useClass: PrismaSearchRepository }],
})
export class SearchModule {}
