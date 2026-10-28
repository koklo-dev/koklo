import {
  createRawDbClient,
  type PrismaClient,
  type TenantClient,
  withTenantIsolation,
} from "@koklo/db";
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

/**
 * Possède le pool Prisma partagé (un seul, `client` dérive de `raw`) et le ferme à l'arrêt.
 *
 * Règle : tout code métier utilise `client` (multi-tenant, sous `withOrganization`). `raw` n'applique
 * AUCUN filtre d'organisation : réservé à Better Auth, à la sonde de santé et aux modèles exclus
 * (`TENANT_EXCLUDED_MODELS`). Ne jamais lire ni écrire un modèle métier via `raw`.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  /** Non filtré par organisation : usage d'infrastructure uniquement (voir la règle ci-dessus). */
  readonly raw: PrismaClient;
  /** Filtré par organisation : défaut pour tout accès aux données métier. */
  readonly client: TenantClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.raw = createRawDbClient(config.databaseUrl);
    this.client = withTenantIsolation(this.raw);
  }

  async onModuleDestroy(): Promise<void> {
    await this.raw.$disconnect();
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
