import { Module } from "@nestjs/common";
import { InvitationModule } from "../invitation/invitation.module.ts";
import { InvitationRepository } from "../invitation/invitation.repository.ts";
import { ProjectCreationQueue } from "../queue/project-creation-queue.ts";
import { SpecDeliverablesModule } from "../spec-deliverables/spec-deliverables.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaProjectRepository } from "./prisma-project.repository.ts";
import { PrismaProjectCardsRepository } from "./prisma-project-cards.repository.ts";
import { PrismaProjectCreationRepository } from "./prisma-project-creation.repository.ts";
import { PrismaProjectShellRepository } from "./prisma-project-shell.repository.ts";
import { ProjectController } from "./project.controller.ts";
import { PROJECT_REPOSITORY } from "./project.repository.ts";
import { ProjectService } from "./project.service.ts";
import { PROJECT_CARDS_REPOSITORY } from "./project-cards.repository.ts";
import { ProjectCardsService } from "./project-cards.service.ts";
import { PROJECT_CREATION_REPOSITORY } from "./project-creation.repository.ts";
import { ProjectCreationService } from "./project-creation.service.ts";
import { PROJECT_SHELL_REPOSITORY } from "./project-shell.repository.ts";
import { ProjectShellService } from "./project-shell.service.ts";

@Module({
  imports: [TrackerModule, SpecReadModule, SpecDeliverablesModule, InvitationModule],
  controllers: [ProjectController],
  providers: [
    ProjectService,
    ProjectShellService,
    ProjectCardsService,
    ProjectCreationService,
    ProjectCreationQueue,
    InvitationRepository,
    { provide: PROJECT_REPOSITORY, useClass: PrismaProjectRepository },
    { provide: PROJECT_SHELL_REPOSITORY, useClass: PrismaProjectShellRepository },
    { provide: PROJECT_CARDS_REPOSITORY, useClass: PrismaProjectCardsRepository },
    { provide: PROJECT_CREATION_REPOSITORY, useClass: PrismaProjectCreationRepository },
  ],
})
export class ProjectModule {}
