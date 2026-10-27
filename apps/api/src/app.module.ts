import { errorStatusMap } from "@koklo/contract";
import { type DynamicModule, Module } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
import { COMMON_ERROR_STATUS_MAP } from "@orpc/server";
import type { AppConfig } from "./config.ts";
import { DatabaseModule } from "./database/database.module.ts";
import { HealthModule } from "./health/health.module.ts";
import { OpenApiController } from "./openapi/openapi.controller.ts";
import { ProjectModule } from "./project/project.module.ts";

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.forRoot(config),
        // Les codes propres au contrat (INTERNAL…) n'ont pas de statut par défaut : on les déclare.
        ORPCModule.forRoot({ errorStatusMap: { ...COMMON_ERROR_STATUS_MAP, ...errorStatusMap } }),
        HealthModule,
        ProjectModule,
      ],
      controllers: [OpenApiController],
    };
  }
}
