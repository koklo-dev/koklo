import { Module } from "@nestjs/common";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaProjectClientRepository } from "./prisma-project-client.repository.ts";
import { ProjectClientController } from "./project-client.controller.ts";
import { PROJECT_CLIENT_REPOSITORY } from "./project-client.repository.ts";
import { ProjectClientService } from "./project-client.service.ts";

@Module({
  imports: [TrackerModule],
  controllers: [ProjectClientController],
  providers: [
    ProjectClientService,
    { provide: PROJECT_CLIENT_REPOSITORY, useClass: PrismaProjectClientRepository },
  ],
})
export class ProjectClientModule {}
