import { Module } from "@nestjs/common";
import { SpecArchitectureModule } from "../spec-architecture/spec-architecture.module.ts";
import { SpecDeliverablesModule } from "../spec-deliverables/spec-deliverables.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { SpecTechnicalModule } from "../spec-technical/spec-technical.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { SpecItemController } from "./spec-item.controller.ts";
import { SpecItemService } from "./spec-item.service.ts";

/** Lecture d'un élément pour le panneau d'édition (TK-101) : le seul module à lire à la fois l'index et les livrables. */
@Module({
  imports: [
    TrackerModule,
    SpecReadModule,
    SpecDeliverablesModule,
    SpecArchitectureModule,
    SpecTechnicalModule,
  ],
  controllers: [SpecItemController],
  providers: [SpecItemService],
})
export class SpecItemModule {}
