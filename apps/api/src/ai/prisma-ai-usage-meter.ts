import { AiUsageMeterStore } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock, systemClock } from "../clock.ts";
import { DatabaseService } from "../database/database.module.ts";

/** Compteur mensuel d'IA : le magasin vit dans `@koklo/db` (partagé avec le worker, TK-99a lot B). */
@Injectable()
export class PrismaAiUsageMeter extends AiUsageMeterStore {
  constructor(
    @Inject(DatabaseService) database: DatabaseService,
    @Inject(CLOCK) clock: Clock = systemClock,
  ) {
    super(database.client, clock);
  }
}
