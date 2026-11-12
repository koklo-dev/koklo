import { RoutingSettingsStore } from "@koklo/db";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.ts";

/** Réglages d'IA par organisation : le magasin vit dans `@koklo/db` (partagé avec le worker, TK-99a lot B). */
@Injectable()
export class PrismaAiRoutingStore extends RoutingSettingsStore {
  constructor(@Inject(DatabaseService) database: DatabaseService) {
    super(database.client);
  }
}
