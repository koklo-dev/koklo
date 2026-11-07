import { Module } from "@nestjs/common";
import { MeController } from "./me.controller.ts";
import { MeRepository } from "./me.repository.ts";
import { MeService } from "./me.service.ts";

@Module({
  controllers: [MeController],
  providers: [MeService, MeRepository],
})
export class MeModule {}
