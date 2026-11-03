import { Module } from "@nestjs/common";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { ClientSpaceController } from "./client-space.controller.ts";
import { CLIENT_SPACE_REPOSITORY } from "./client-space.repository.ts";
import { ClientSpaceService } from "./client-space.service.ts";
import { PrismaClientSpaceRepository } from "./prisma-client-space.repository.ts";

@Module({
  imports: [TrackerModule, SpecReadModule],
  controllers: [ClientSpaceController],
  providers: [
    ClientSpaceService,
    { provide: CLIENT_SPACE_REPOSITORY, useClass: PrismaClientSpaceRepository },
  ],
})
export class ClientSpaceModule {}
