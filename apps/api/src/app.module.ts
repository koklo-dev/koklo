import { type DynamicModule, Module } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
import { AuthModule } from "./auth/auth.module.ts";
import type { AppConfig } from "./config.ts";
import { DatabaseModule } from "./database/database.module.ts";
import { ERROR_STATUS_MAP } from "./error-status.ts";
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
        AuthModule.forRoot(config),
        ORPCModule.forRoot({ errorStatusMap: ERROR_STATUS_MAP }),
        HealthModule,
        ProjectModule,
      ],
      controllers: [OpenApiController],
    };
  }
}
