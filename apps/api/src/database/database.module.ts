import { createDbClient, type PrismaClient } from "@koklo/db";
import {
  type DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { AppConfig } from "../config.ts";

export const APP_CONFIG = Symbol("APP_CONFIG");

/** Possède le client Prisma partagé (un seul pool) et le ferme à l'arrêt de l'application. */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createDbClient(config.databaseUrl);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: APP_CONFIG, useValue: config }, DatabaseService],
      exports: [APP_CONFIG, DatabaseService],
    };
  }
}
