import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { GitAccess } from "./git-access.ts";
import { PrismaRepoRepository } from "./prisma-repo.repository.ts";
import { RepoController } from "./repo.controller.ts";
import { REPO_REPOSITORY } from "./repo.repository.ts";
import { RepoService } from "./repo.service.ts";

@Module({
  imports: [TrackerModule],
  controllers: [RepoController],
  providers: [RepoService, GitAccess, { provide: REPO_REPOSITORY, useClass: PrismaRepoRepository }],
})
export class RepoModule {}
