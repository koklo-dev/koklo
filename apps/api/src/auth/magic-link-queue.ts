import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import type { AppConfig } from "../config.ts";
import { APP_CONFIG } from "../database/database.module.ts";

/** File consommée par le worker (même nom que `SEND_MAGIC_LINK_QUEUE` côté worker). */
export const SEND_MAGIC_LINK_QUEUE = "send-magic-link";

export interface MagicLinkJob {
  readonly email: string;
  readonly url: string;
}

/** Ce que `createAuth` attend pour remettre un lien : enfiler, jamais envoyer. */
export type EnqueueMagicLink = (job: MagicLinkJob) => Promise<void>;

/**
 * Producteur pg-boss seul : l'api n'envoie aucun email, elle dépose `{ email, url }` dans la file
 * du worker (qui possède migrations, création de la file et rétention). La connexion est ouverte
 * à la première demande, pas au démarrage : l'api reste disponible sans file, et un échec de
 * connexion n'est pas mémorisé. Le payload porte le jeton : il n'est jamais journalisé.
 */
@Injectable()
export class MagicLinkQueue implements OnModuleDestroy {
  private boss: Promise<PgBoss> | undefined;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  readonly enqueue: EnqueueMagicLink = async (job) => {
    const boss = await this.connect();
    await boss.send(SEND_MAGIC_LINK_QUEUE, { email: job.email, url: job.url });
  };

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
