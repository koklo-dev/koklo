import type { IncomingMessage } from "node:http";
import { type LogDestination, setupObservability } from "@koklo/observability";
import { type DynamicModule, Module } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
import { LoggerModule } from "nestjs-pino";
import { AuditModule } from "./audit/audit.module.ts";
import { AuthModule } from "./auth/auth.module.ts";
import { ClockModule } from "./clock.ts";
import { CommentModule } from "./comment/comment.module.ts";
import type { AppConfig } from "./config.ts";
import { DatabaseModule } from "./database/database.module.ts";
import { ERROR_STATUS_MAP } from "./error-status.ts";
import { HealthModule } from "./health/health.module.ts";
import { validationStatusInterceptor } from "./input-validation.ts";
import { InstallationModule } from "./installation/installation.module.ts";
import { LeaseModule } from "./lease/lease.module.ts";
import { LlmCredentialModule } from "./llm-credential/llm-credential.module.ts";
import { MemberModule } from "./member/member.module.ts";
import { OpenApiController } from "./openapi/openapi.controller.ts";
import { OrganizationModule } from "./organization/organization.module.ts";
import { ProjectModule } from "./project/project.module.ts";
import { ProjectStateModule } from "./project-state/project-state.module.ts";
import { GitProviderModule } from "./repo/git-provider.module.ts";
import { RepoModule } from "./repo/repo.module.ts";
import { requestIdFrom } from "./request-context.ts";
import { useRequestLogger } from "./request-logger.ts";
import { serializeRequest, serializeResponse } from "./request-serializer.ts";
import { SpecBatchModule } from "./spec-batch/spec-batch.module.ts";
import { SpecReadModule } from "./spec-read/spec-read.module.ts";
import { SprintModule } from "./sprint/sprint.module.ts";
import { SprintImportModule } from "./sprint-import/sprint-import.module.ts";
import { TicketModule } from "./ticket/ticket.module.ts";
import { WebhookModule } from "./webhook/webhook.module.ts";

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
            serializers: { req: serializeRequest, res: serializeResponse },
            customLogLevel: (_request, response, error) =>
              error || response.statusCode >= 500 ? "error" : "info",
            customProps: (request) => ({ requestId: request.id }),
          },
        }),
        ClockModule,
        DatabaseModule.forRoot(config),
        AuthModule.forRoot(config),
        ORPCModule.forRoot({
          errorStatusMap: ERROR_STATUS_MAP,
          clientInterceptors: [validationStatusInterceptor],
        }),
        HealthModule,
        OrganizationModule,
        MemberModule,
        ProjectModule,
        TicketModule,
        SprintModule,
        SprintImportModule,
        LeaseModule,
        ProjectStateModule,
        CommentModule,
        AuditModule,
        GitProviderModule.forRoot(config),
        RepoModule,
        InstallationModule,
        LlmCredentialModule,
        SpecBatchModule,
        SpecReadModule,
        WebhookModule,
      ],
      controllers: [OpenApiController],
    };
  }
}
