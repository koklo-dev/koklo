import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module.ts";
import { SpecReadModule } from "../spec-read/spec-read.module.ts";
import { TrackerModule } from "../tracker/tracker.module.ts";
import { PrismaSuggestionRepository } from "./prisma-suggestion.repository.ts";
import { SuggestionController } from "./suggestion.controller.ts";
import { SUGGESTION_REPOSITORY } from "./suggestion.repository.ts";
import { SuggestionService } from "./suggestion.service.ts";

/** Le service n'est pas exporté : seul le contrôleur décide d'une suggestion (session humaine). */
@Module({
  imports: [TrackerModule, SpecReadModule, NotificationModule],
  controllers: [SuggestionController],
  providers: [
    SuggestionService,
    { provide: SUGGESTION_REPOSITORY, useClass: PrismaSuggestionRepository },
  ],
})
export class SuggestionModule {}
