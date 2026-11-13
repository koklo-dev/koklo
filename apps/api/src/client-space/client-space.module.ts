import { Module } from "@nestjs/common";
import { SpecDataModule } from "../spec-data/spec-data.module.ts";
import { SpecDeliverablesModule } from "../spec-deliverables/spec-deliverables.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { ClientSpaceController } from "./client-space.controller.ts";
import { CLIENT_SPACE_REPOSITORY } from "./client-space.repository.ts";
import { ClientSpaceService } from "./client-space.service.ts";
import { CLIENT_SPACE_DATA_REPOSITORY } from "./client-space-data.repository.ts";
import { ClientSpaceDataService } from "./client-space-data.service.ts";
import { ClientSpaceEntitiesService } from "./client-space-entities.service.ts";
import { PrismaClientSpaceRepository } from "./prisma-client-space.repository.ts";
import { PrismaClientSpaceData } from "./prisma-client-space-data.ts";

@Module({
  imports: [TrackerModule, SpecReadModule, SpecDeliverablesModule, SpecDataModule],
  controllers: [ClientSpaceController],
  providers: [
    ClientSpaceService,
    ClientSpaceEntitiesService,
    ClientSpaceDataService,
    { provide: CLIENT_SPACE_DATA_REPOSITORY, useClass: PrismaClientSpaceData },
    { provide: CLIENT_SPACE_REPOSITORY, useClass: PrismaClientSpaceRepository },
  ],
})
export class ClientSpaceModule {}
