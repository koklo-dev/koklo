import { captureError } from "@koklo/observability";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";
import { requestLogger } from "../request-logger.ts";

/**
 * Producteur pg-boss seul : l'api n'exécute aucun job, elle dépose un payload dans la file du
 * worker (qui possède migrations, création de la file et rétention). La connexion est ouverte à
 * la première demande, pas au démarrage : l'api reste disponible sans file, et un échec de
 * connexion n'est pas mémorisé. Les payloads portent des liens à jeton : jamais journalisés.
 *
 * Un échec d'enfilage est journalisé (nom de la file et de l'erreur seulement) et signalé au SDK
 * d'erreurs, puis relancé. Better Auth avale l'erreur de `sendInvitationEmail` : sans cette trace,
 * une invitation sans email resterait invisible.
 */
@Injectable()
export abstract class PgBossProducer implements OnModuleDestroy {
  private boss: Promise<PgBoss> | undefined;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  protected async send(queue: string, payload: object): Promise<void> {
    try {
      const boss = await this.connect();
      await boss.send(queue, payload);
    } catch (error) {
      requestLogger().error(
        { queue, errorName: error instanceof Error ? error.name : "erreur" },
        "enqueue failed",
      );
      captureError(error, { queue });
      throw error;
    }
  }

  private connect(): Promise<PgBoss> {
    this.boss ??= this.open().catch((error: unknown) => {
      this.boss = undefined;
      throw error;
    });
    return this.boss;
  }

  private async open(): Promise<PgBoss> {
    const boss = new PgBoss({
      connectionString: this.config.databaseUrl,
      migrate: false,
      supervise: false,
      schedule: false,
    });
    boss.on("error", () => undefined);
    try {
      await boss.start();
    } catch (error) {
      await boss.stop().catch(() => undefined);
      throw error;
    }
    return boss;
  }

  async onModuleDestroy(): Promise<void> {
    const boss = await this.boss?.catch(() => undefined);
    await boss?.stop();
  }
}
