import type { IncomingMessage } from "node:http";
import { type LogDestination, setupObservability } from "@koklo/observability";
import { type DynamicModule, Module } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module.ts";
import type { AppConfig } from "./config.ts";
import { DatabaseModule } from "./database/database.module.ts";
import { ERROR_STATUS_MAP } from "./error-status.ts";
import { HealthModule } from "./health/health.module.ts";
import { MemberModule } from "./member/member.module.ts";
import { OpenApiController } from "./openapi/openapi.controller.ts";
import { OrganizationModule } from "./organization/organization.module.ts";
import { ProjectModule } from "./project/project.module.ts";
import { requestIdFrom } from "./request-context.ts";
import { useRequestLogger } from "./request-logger.ts";
import { serializeRequest } from "./request-serializer.ts";

export interface AppModuleOptions {
  /** Destination des lignes de journal (défaut : stdout) ; les tests y lisent le JSON émis. */
  logStream?: LogDestination;
}

const requestIdOfMessage = (request: IncomingMessage): string =>
  requestIdFrom(request.headers["x-request-id"]);

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, options: AppModuleOptions = {}): DynamicModule {
    const logger = setupObservability({
      dsn: config.sentryDsn,
      environment: config.appEnv,
      release: config.appVersion,
      level: config.logLevel,
      destination: options.logStream,
    });
    useRequestLogger(logger);
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            logger,
            genReqId: requestIdOfMessage,
            serializers: { req: serializeRequest },
            customLogLevel: (_request, response, error) =>
              error || response.statusCode >= 500 ? "error" : "info",
            customProps: (request) => ({ requestId: request.id }),
          },
        }),
        DatabaseModule.forRoot(config),
        AuthModule.forRoot(config),
        ORPCModule.forRoot({ errorStatusMap: ERROR_STATUS_MAP }),
        HealthModule,
        OrganizationModule,
        MemberModule,
        ProjectModule,
      ],
      controllers: [OpenApiController],
    };
  }
}
